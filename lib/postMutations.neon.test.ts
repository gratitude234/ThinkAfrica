import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The post mutation domain, executed against Neon.
 *
 * `lib/postPolicy.neon.test.ts` proves the policy refuses what the database
 * permits. This proves the other half: that the PostgreSQL repository beneath
 * that policy performs the legitimate mutations correctly, and that the
 * forbidden ones still never reach a statement.
 *
 * It imports the real `lib/postMutations.ts`. Every call runs the same policy,
 * the same predicates and the same affected-row check a server action runs;
 * only the repository differs, which is the thing being tested.
 *
 * Everything happens inside one transaction that is rolled back, on rows
 * created inside it. Nothing here can outlive the run.
 *
 * Run with:  node scripts/migration/neon-write-rehearsal.mjs
 */

const neonUrl = process.env.DATABASE_URL;
const enabled = Boolean(neonUrl && neonUrl.includes(".neon.tech"));

const mutations = await import("@/lib/postMutations");
const { createPostgresWriteRepository } = await import("@/lib/db/postWrites");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import type { PostActor } from "@/lib/postPolicy";
import type { PostWriteRepository } from "@/lib/db/postWrites";
import type { SqlExecutor } from "@/lib/db/postgres/executor";

type Sql = Awaited<ReturnType<typeof openConnection>>["sql"];

async function openConnection() {
  const { default: postgres } = await import("postgres");
  const sql = postgres(neonUrl!, {
    max: 1,
    prepare: false,
    connect_timeout: 20,
    fetch_types: false,
    onnotice: () => {},
  });
  return { sql };
}

describe.skipIf(!enabled)("the mutation domain against Neon", () => {
  let sql: Sql;
  let tx: SqlExecutor;
  let repository: PostWriteRepository;
  let authorId: string;
  let finish: (() => void) | null = null;
  let ready: Promise<void>;

  const author = (): PostActor => ({ kind: "author", userId: authorId });
  const admin: PostActor = { kind: "admin", userId: "00000000-0000-4000-8000-0000000000ad" };

  /** The context the domain takes. `supabase` is never touched: the repository
   *  override is what this test is about. */
  const context = (actor: PostActor) =>
    ({ supabase: null as never, actor, repository });

  beforeAll(async () => {
    ({ sql } = await openConnection());

    // One long-lived transaction for the whole suite, held open by a promise
    // that resolves when the suite is done. Rolled back unconditionally.
    ready = new Promise<void>((resolveReady) => {
      const done = new Promise<void>((resolveDone) => {
        finish = resolveDone;
      });

      void sql
        .begin(async (transaction) => {
          tx = adaptDriver(transaction as never);
          repository = createPostgresWriteRepository(tx, async (run) => run(tx));

          const [profile] = await transaction.unsafe(
            "select id from public.profiles limit 1"
          );
          authorId = String(profile.id);

          resolveReady();
          await done;
          throw new Error("__rollback__");
        })
        .catch((error: Error) => {
          if (error.message !== "__rollback__") throw error;
        });
    });

    await ready;
  }, 120_000);

  afterAll(async () => {
    finish?.();
    // Give the rollback a moment to land before closing the socket.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await sql?.end({ timeout: 5 });
  }, 60_000);

  async function seed(overrides: Record<string, unknown> = {}) {
    const values = {
      title: "Rehearsal post",
      slug: `rehearsal-${Math.random().toString(36).slice(2, 12)}`,
      content: "<p>body</p>",
      excerpt: "excerpt",
      content_kind: "article",
      status: "draft",
      tags: ["governance", "policy"],
      author_id: authorId,
      ...overrides,
    };
    return repository.insert(values);
  }

  async function statusOf(postId: string) {
    const rows = await tx.query<{ status: string }>(
      "select status from public.posts where id = $1::uuid",
      [postId]
    );
    return rows[0]?.status ?? null;
  }

  // ── Permitted ────────────────────────────────────────────────────

  it("creates a draft, with array columns intact", async () => {
    const id = await seed();
    const rows = await tx.query<{ tags: unknown; status: string }>(
      "select to_jsonb(tags) as tags, status from public.posts where id = $1::uuid",
      [id]
    );
    // The write direction of the fetch_types: false array problem. A text[]
    // sent as a parameter arrives as the string `a,b` and Postgres rejects it,
    // so the repository sends jsonb and unpacks it in SQL.
    expect(rows[0].tags).toEqual(["governance", "policy"]);
    expect(rows[0].status).toBe("draft");
  });

  it("edits a draft", async () => {
    const id = await seed();
    const result = await mutations.updatePostContent(context(author()), id, {
      title: "Edited by the rehearsal",
    });
    expect(result.ok).toBe(true);

    const rows = await tx.query<{ title: string }>(
      "select title from public.posts where id = $1::uuid",
      [id]
    );
    expect(rows[0].title).toBe("Edited by the rehearsal");
  });

  it("renames a slug", async () => {
    const id = await seed();
    const result = await mutations.renamePostSlug(
      context(author()),
      id,
      "renamed-by-the-rehearsal"
    );
    expect(result.ok).toBe(true);

    const rows = await tx.query<{ slug: string }>(
      "select slug from public.posts where id = $1::uuid",
      [id]
    );
    expect(rows[0].slug).toBe("renamed-by-the-rehearsal");
  });

  it("publishes an ordinary draft", async () => {
    const id = await seed();
    const result = await mutations.publishOwnDraft(context(author()), id);
    expect(result.ok).toBe(true);
    expect(await statusOf(id)).toBe("published");
  });

  it("deletes a draft", async () => {
    const id = await seed();
    const result = await mutations.deleteDraftPost(context(author()), id);
    expect(result.ok).toBe(true);
    expect(await statusOf(id)).toBeNull();
  });

  it("edits a published post, which review used to lock", async () => {
    const id = await seed({ status: "published" });
    const result = await mutations.updatePostContent(context(author()), id, {
      title: "Edited after publication",
    });
    expect(result.ok).toBe(true);

    const rows = await tx.query<{ title: string }>(
      "select title from public.posts where id = $1::uuid",
      [id]
    );
    expect(rows[0].title).toBe("Edited after publication");
  });

  it("removes and restores a post", async () => {
    const id = await seed({ status: "published" });

    const removed = await mutations.removePost(context(admin), id);
    expect(removed.ok).toBe(true);
    expect(await statusOf(id)).toBe("removed");

    const restored = await mutations.restorePost(context(admin), id);
    expect(restored.ok).toBe(true);
    expect(await statusOf(id)).toBe("published");
  });

  // ── Forbidden ────────────────────────────────────────────────────

  it("refuses every forbidden write, and changes nothing", async () => {
    const draft = await seed();
    const published = await seed({ status: "published" });
    const withdrawn = await seed({ status: "withdrawn" });
    const removed = await seed({ status: "removed" });

    const attempts: Array<[string, Promise<{ ok: boolean }>]> = [
      [
        "direct citation_id write",
        mutations.updatePostContent(context(author()), draft, {
          citation_id: "INDEGENIUS-FORGED",
        }),
      ],
      [
        "direct published_version_id write",
        mutations.updatePostContent(context(author()), draft, {
          published_version_id: "00000000-0000-4000-8000-000000000001",
        }),
      ],
      [
        "reclassify through an ordinary content edit",
        mutations.updatePostContent(context(author()), draft, {
          content_kind: "post",
        }),
      ],
      [
        "write the legacy type the database now derives",
        mutations.updateDraftComposition(context(author()), draft, {
          type: "essay",
        }),
      ],
      [
        "hard-delete a non-draft",
        mutations.deleteDraftPost(context(author()), published),
      ],
      [
        "mutate a withdrawn submission",
        mutations.updatePostContent(context(author()), withdrawn, {
          title: "Resurrected",
        }),
      ],
      [
        "mutate a removed post",
        mutations.updatePostContent(context(author()), removed, {
          title: "Edited around moderation",
        }),
      ],
      [
        "unpublish by transition",
        mutations.transitionPost(context(author()), published, "draft"),
      ],
      [
        "submit for review, which is no longer a transition",
        mutations.transitionPost(context(author()), draft, "pending"),
      ],
    ];

    const permitted: string[] = [];
    for (const [name, attempt] of attempts) {
      const result = await attempt;
      if (result.ok) permitted.push(name);
    }

    expect(permitted, "the domain permitted a forbidden write on Neon").toEqual([]);

    // And nothing moved. The refusals happen before any statement, so the
    // rows are exactly as seeded.
    expect(await statusOf(draft)).toBe("draft");
    expect(await statusOf(published)).toBe("published");
    expect(await statusOf(withdrawn)).toBe("withdrawn");
    expect(await statusOf(removed)).toBe("removed");

    const rows = await tx.query<{ citation_id: string | null; title: string }>(
      "select citation_id, title from public.posts where id = $1::uuid",
      [draft]
    );
    expect(rows[0].citation_id).toBeNull();
    expect(rows[0].title).toBe("Rehearsal post");
  }, 120_000);

  it("refuses a stranger writing to somebody else's post", async () => {
    const id = await seed();
    const stranger: PostActor = {
      kind: "author",
      userId: "00000000-0000-4000-8000-00000000dead",
    };

    const result = await mutations.updatePostContent(context(stranger), id, {
      title: "Not mine",
    });
    expect(result.ok).toBe(false);

    const rows = await tx.query<{ title: string }>(
      "select title from public.posts where id = $1::uuid",
      [id]
    );
    expect(rows[0].title).toBe("Rehearsal post");
  });

  it("reports a conflict when the row moved under it, rather than success", async () => {
    const id = await seed();

    // The real race is: the domain reads, the row moves, the write lands. It
    // cannot be produced by moving the row first, because the domain would
    // simply read the new state and authorize against that. So the read is
    // made stale on purpose: the repository hands back the draft snapshot the
    // policy saw while the row has already been published underneath.
    //
    // What this proves is the part that has no policy in it. The predicates in
    // the UPDATE and the affected-row check are the only things standing
    // between a stale authorization and a write that lands on a row nobody
    // authorized.
    const stale = await repository.loadState(id);
    expect(stale?.status).toBe("draft");

    await tx.query("update public.posts set status = 'published' where id = $1::uuid", [id]);

    const staleRepository = {
      ...repository,
      loadState: async () => stale,
    } as typeof repository;

    const result = await mutations.updatePostContent(
      { supabase: null as never, actor: author(), repository: staleRepository },
      id,
      { title: "Should not land" }
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.kind).toBe("conflict");

    const rows = await tx.query<{ title: string }>(
      "select title from public.posts where id = $1::uuid",
      [id]
    );
    expect(rows[0].title).toBe("Rehearsal post");
  }, 120_000);
});

describe.skipIf(enabled)("the mutation domain against Neon", () => {
  it("is skipped without a Neon scratch connection", () => {
    console.info(
      "[neon-write-rehearsal] skipped: DATABASE_URL is not a Neon scratch connection string."
    );
    expect(enabled).toBe(false);
  });
});
