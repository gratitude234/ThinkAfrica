import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * BEHAVIOURAL PROOF for the public profile's reads, against real PostgreSQL.
 *
 * This is not live same-database parity. It proves the SQL does what the
 * PostgREST calls did: the right relations, the visibility rules that RLS was
 * carrying, the shapes `lib/profileViewData.ts` consumes, and the two
 * deliberate infidelities documented in `lib/db/profilePage.ts`, and the
 * owner-only Drafts read. Agreement
 * with PostgREST on the same rows at the same instant is
 * `profilePage.parity.live.test.ts`, which needs Supabase reachable.
 *
 * Read-only. Nothing here writes.
 */

const neonUrl = process.env.DATABASE_URL;
const enabled = Boolean(neonUrl && neonUrl.includes(".neon.tech"));

const { createPostgresProfilePageRepository } = await import("@/lib/db/profilePage");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import type { ProfilePublicationKind } from "@/lib/profileTabs";

import type { SqlExecutor } from "@/lib/db/postgres/executor";
import type { ProfilePageRepository } from "@/lib/db/profilePage";

const NO_SUCH_PROFILE = "00000000-0000-0000-0000-000000000000";

const KINDS: ProfilePublicationKind[] = ["article", "post"];

// A cold pooled connection can take longer than the 5s default before the
// first statement returns, and every test here starts with a real round trip.
vi.setConfig({ testTimeout: 60_000 });


describe.skipIf(!enabled)("public profile reads against PostgreSQL", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let executor: SqlExecutor;
  let repository: ProfilePageRepository;

  async function open() {
    const { default: postgres } = await import("postgres");
    return postgres(neonUrl!, {
      max: 1,
      prepare: false,
      connect_timeout: 20,
      fetch_types: false,
      onnotice: () => {},
    });
  }

  beforeAll(async () => {
    sql = await open();
    executor = adaptDriver(sql as never);
    repository = createPostgresProfilePageRepository(executor);
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  /**
   * A profile that has published something, together with a content kind the
   * publication filter actually matches.
   *
   * The kind is not optional and there is no "all": `publicationBranches`
   * selects on `content_kind` alone, which is what a profile tab is. Asking
   * for a kind nothing carries is a valid empty answer, so a test that passed
   * one would prove nothing.
   */
  async function someAuthor() {
    const [row] = await executor.query<{ id: string }>(
      `select p.author_id::text as id
       from public.posts p
       where p.status = 'published' and p.author_id is not null
       group by p.author_id
       order by count(*) desc
       limit 1`
    );
    if (!row) return null;

    for (const kind of KINDS) {
      const branches = await repository.publicationBranches({
        profileId: row.id,
        contentKinds: [kind],
        start: 0,
        limit: 1,
      });
      if (branches.owned.length > 0) {
        return { id: row.id, contentKinds: [kind] };
      }
    }
    return null;
  }

  /** For the reads that take only an id and do not filter by kind. */
  async function someAuthorId() {
    const [row] = await executor.query<{ id: string }>(
      `select p.author_id::text as id
       from public.posts p
       where p.status = 'published' and p.author_id is not null
       group by p.author_id
       order by count(*) desc
       limit 1`
    );
    return row?.id ?? null;
  }

  /**
   * A member credited as an accepted co-author on somebody else's published
   * work, and the ids of that work. Co-authoring is retired, so none of it may
   * appear on this member's profile.
   */
  async function someCreditedMember() {
    const rows = await executor.query<{ user_id: string; post_id: string }>(
      `select pa.user_id::text as user_id, pa.post_id::text as post_id
       from public.post_authors pa
       join public.posts p on p.id = pa.post_id
       where pa.accepted_at is not null
         and p.status = 'published'
         and pa.user_id <> p.author_id
       limit 20`
    );
    const [first] = rows;
    if (!first) return null;
    return {
      id: first.user_id,
      creditedPostIds: rows
        .filter((row) => row.user_id === first.user_id)
        .map((row) => row.post_id),
    };
  }

  /** A member with at least one draft. */
  async function someDraftOwner() {
    const [row] = await executor.query<{ id: string }>(
      `select p.author_id::text as id
       from public.posts p
       where p.status = 'draft' and p.author_id is not null
       limit 1`
    );
    return row?.id ?? null;
  }

  // ── counts ─────────────────────────────────────────────────────────

  it("returns both relationship counts as numbers, not bigint strings", async () => {
    const author = await someAuthorId();
    if (!author) return;

    const counts = await repository.relationshipCounts(author);

    expect(typeof counts.followerCount).toBe("number");
    expect(typeof counts.followingCount).toBe("number");
    expect(Number.isInteger(counts.followerCount)).toBe(true);
    expect(Number.isInteger(counts.followingCount)).toBe(true);
  });

  it("counts followers and following in the directions the header claims", async () => {
    const author = await someAuthorId();
    if (!author) return;

    const counts = await repository.relationshipCounts(author);
    const [truth] = await executor.query<{ followers: string; following: string }>(
      `select
         (select count(*) from public.follows where following_id = $1::uuid) as followers,
         (select count(*) from public.follows where follower_id = $1::uuid) as following`,
      [author]
    );

    // The two directions are easy to swap and the mistake is invisible on any
    // profile that happens to follow back as often as it is followed.
    expect(counts.followerCount).toBe(Number(truth.followers));
    expect(counts.followingCount).toBe(Number(truth.following));
  });

  it("reports zero for a profile that does not exist, rather than throwing", async () => {
    const counts = await repository.relationshipCounts(NO_SUCH_PROFILE);
    expect(counts).toEqual({ followerCount: 0, followingCount: 0 });
  });

  // ── viewer relationship ────────────────────────────────────────────

  it("reports a stranger with no relationship as false on every flag", async () => {
    const author = await someAuthorId();
    if (!author) return;

    const relationship = await repository.viewerRelationship(author, NO_SUCH_PROFILE);

    expect(relationship).toEqual({
      isFollowing: false,
      isBlocked: false,
    });
  });

  it("finds a real follow, in the viewer-follows-profile direction", async () => {
    const [edge] = await executor.query<{ follower: string; following: string }>(
      `select follower_id::text as follower, following_id::text as following
       from public.follows limit 1`
    );
    if (!edge) return;

    const forward = await repository.viewerRelationship(edge.following, edge.follower);
    expect(forward.isFollowing).toBe(true);

    // And not the other way round, unless they genuinely follow back.
    const [back] = await executor.query<{ n: string }>(
      `select count(*) as n from public.follows
       where follower_id = $1::uuid and following_id = $2::uuid`,
      [edge.following, edge.follower]
    );
    const reverse = await repository.viewerRelationship(edge.follower, edge.following);
    expect(reverse.isFollowing).toBe(Number(back.n) > 0);
  });

  // ── publications ───────────────────────────────────────────────────

  it("returns only published posts on the owned branch", async () => {
    const author = await someAuthor();
    if (!author) return;

    const branches = await repository.publicationBranches({
      profileId: author.id,
      contentKinds: author.contentKinds,
      start: 0,
      limit: 10,
    });

    expect(branches.owned.length).toBeGreaterThan(0);
    for (const post of branches.owned) {
      expect(post.author_id).toBe(author.id);
    }

    const ids = branches.owned.map((post) => post.id);
    const unpublished = await executor.query<{ id: string }>(
      `select id::text as id from public.posts
       where id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)
         and status <> 'published'`,
      [JSON.stringify(ids)]
    );
    expect(unpublished).toEqual([]);
  });

  it("orders owned publications newest first, published_at before created_at", async () => {
    const author = await someAuthor();
    if (!author) return;

    const { owned } = await repository.publicationBranches({
      profileId: author.id,
      contentKinds: author.contentKinds,
      start: 0,
      limit: 20,
    });
    if (owned.length < 2) return;

    const keys = owned.map((post) =>
      post.published_at ? Date.parse(post.published_at) : Number.NEGATIVE_INFINITY
    );
    // nulls last under desc, which is what the PostgREST order carried.
    for (let i = 1; i < keys.length; i += 1) {
      expect(keys[i]).toBeLessThanOrEqual(keys[i - 1]);
    }
  });

  it("lists none of somebody else's publications a profile was credited on", async () => {
    const member = await someCreditedMember();
    if (!member) return;

    for (const kind of KINDS) {
      const branches = await repository.publicationBranches({
        profileId: member.id,
        contentKinds: [kind],
        start: 0,
        limit: 50,
      });

      expect(branches.coauthored).toEqual([]);
      for (const post of branches.owned) {
        expect(post.author_id).toBe(member.id);
        expect(member.creditedPostIds).not.toContain(post.id);
      }
    }
  });

  it("returns empty branches for a profile with no content", async () => {
    const branches = await repository.publicationBranches({
      profileId: NO_SUCH_PROFILE,
      contentKinds: ["article"],
      start: 0,
      limit: 10,
    });
    expect(branches).toEqual({ owned: [], coauthored: [] });
  });

  it("offset-paginates the owned branch, so page two continues page one", async () => {
    const author = await someAuthor();
    if (!author) return;

    const input = { profileId: author.id, contentKinds: author.contentKinds, limit: 1 };
    const firstPage = await repository.publicationBranches({ ...input, start: 0 });
    const secondPage = await repository.publicationBranches({ ...input, start: 1 });
    if (secondPage.owned.length === 0) return;

    expect(secondPage.owned[0]?.id).not.toBe(firstPage.owned[0]?.id);
    expect(firstPage.coauthored).toEqual([]);
    expect(secondPage.coauthored).toEqual([]);
  });

  // ── owner drafts ───────────────────────────────────────────────────

  it("gives the owner only their own drafts, newest edit first", async () => {
    const owner = await someDraftOwner();
    if (!owner) return;

    const drafts = await repository.ownerDrafts({ profileId: owner, viewerId: owner });
    expect(drafts.length).toBeGreaterThan(0);

    const truth = await executor.query<{ id: string }>(
      `select id::text as id from public.posts
       where author_id = $1::uuid and status = 'draft'`,
      [owner]
    );
    expect(drafts.map((draft) => draft.id).sort()).toEqual(
      truth.map((row) => row.id).sort()
    );

    const edited = drafts.map((draft) => Date.parse(draft.updated_at));
    for (let i = 1; i < edited.length; i += 1) {
      expect(edited[i]).toBeLessThanOrEqual(edited[i - 1]);
    }
  });

  it("gives anyone but the owner no drafts at all", async () => {
    const owner = await someDraftOwner();
    if (!owner) return;

    await expect(
      repository.ownerDrafts({ profileId: owner, viewerId: NO_SUCH_PROFILE })
    ).resolves.toEqual([]);
  });
});
