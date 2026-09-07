import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Proof, against the Neon scratch database, that the application layer refuses
 * every write the trigger there does not.
 *
 * This test is in two halves and both are necessary.
 *
 * **First it demonstrates the gap.** Each case issues the forbidden statement
 * directly against Neon and asserts that Postgres *accepts* it. If that half
 * ever starts failing, the premise has changed: something is enforcing these
 * rules in the database again, and this file should be re-read rather than
 * deleted. Without this half the second half is a strawman.
 *
 * **Then it asserts the policy refuses the same operation.** No database, no
 * RLS, no trigger: `lib/postPolicy.ts` alone.
 *
 * Everything runs inside one transaction that is always rolled back, and the
 * rows are synthetic ones created inside it, so no real post is touched even
 * momentarily.
 *
 * Run with:  node scripts/migration/neon-write-safety.mjs
 */

const neonUrl = process.env.DATABASE_URL;
const enabled = Boolean(neonUrl && neonUrl.includes(".neon.tech"));

const {
  canWriteToPost,
  checkContentEdit,
  checkDelete,
  checkTransition,
} = await import("@/lib/postPolicy");
import type { PostActor, PostStateSnapshot } from "@/lib/postPolicy";

const AUTHOR: PostActor = { kind: "author", userId: "" };

/** The eight things the Neon trigger lets through. */
interface FailOpenCase {
  name: string;
  /** How the row starts. */
  seed: { status: string; type: string; citation_id?: string | null };
  /** The forbidden statement, as a SET clause. */
  set: string;
  /** A DELETE rather than an UPDATE. */
  del?: boolean;
  /** Create a post_versions row first and substitute its id for $VERSION. */
  needsVersionRow?: boolean;
  /** The same operation, asked of the policy. */
  policy: (post: PostStateSnapshot, actor: PostActor) => { allowed: boolean };
}

const CASES: FailOpenCase[] = [
  {
    name: "direct self-publish of a research paper",
    seed: { status: "draft", type: "research" },
    set: "status = 'published'",
    policy: (post, actor) =>
      checkTransition({ actor, post, nextStatus: "published" }),
  },
  {
    name: "direct citation_id write",
    seed: { status: "draft", type: "essay" },
    set: "citation_id = 'INDEGENIUS-FORGED'",
    policy: (post, actor) =>
      checkContentEdit(actor, post, { citation_id: "INDEGENIUS-FORGED" }),
  },
  {
    name: "direct published_version_id write",
    seed: { status: "draft", type: "essay" },
    // Not a random UUID: `posts_published_version_id_fkey` rejects one, which
    // is a real constraint doing real work and worth knowing about. The
    // attack it does not stop is pointing at a version row that exists, so
    // the probe creates one and points at that. `$VERSION` is substituted
    // with the id of a post_versions row inserted inside the transaction.
    set: "published_version_id = '$VERSION'",
    needsVersionRow: true,
    policy: (post, actor) =>
      checkContentEdit(actor, post, { published_version_id: "forged" }),
  },
  {
    name: "editing a locked accepted publication",
    seed: { status: "published", type: "research" },
    set: "title = 'Rewritten after acceptance'",
    policy: (post, actor) =>
      checkContentEdit(actor, post, { title: "Rewritten after acceptance" }),
  },
  {
    name: "hard-deleting a non-draft",
    seed: { status: "pending", type: "research" },
    set: "",
    del: true,
    policy: (post, actor) => checkDelete(actor, post),
  },
  {
    name: "resurrecting a withdrawn submission",
    seed: { status: "withdrawn", type: "research" },
    set: "status = 'pending'",
    policy: (post, actor) =>
      checkTransition({ actor, post, nextStatus: "pending" }),
  },
  {
    name: "mutating a removed post",
    seed: { status: "removed", type: "essay" },
    set: "title = 'Edited around moderation'",
    policy: (post, actor) =>
      checkContentEdit(actor, post, { title: "Edited around moderation" }),
  },
  {
    name: "an illegal review-state transition",
    seed: { status: "published", type: "essay" },
    set: "status = 'draft'",
    policy: (post, actor) => checkTransition({ actor, post, nextStatus: "draft" }),
  },
];

describe.skipIf(!enabled)(
  "Neon fails open; the application layer does not",
  () => {
    it("refuses in the application every write Neon accepts", async () => {
      const { default: postgres } = await import("postgres");
      const sql = postgres(neonUrl!, {
        max: 1,
        prepare: false,
        connect_timeout: 20,
        onnotice: () => {},
      });

      const acceptedByNeon: string[] = [];
      const refusedByPolicy: string[] = [];

      try {
        await sql
          .begin(async (tx) => {
            // Confirm the premise before relying on it: the connecting role is
            // not the literal 'authenticated', which is exactly why the
            // trigger's bypass fires.
            const [{ who }] = await tx.unsafe(
              "select current_user::text as who"
            );
            expect(
              who,
              "if this is 'authenticated', the trigger is live and this test's premise is wrong"
            ).not.toBe("authenticated");

            const [profile] = await tx.unsafe(
              "select id from public.profiles limit 1"
            );
            expect(profile, "Neon holds no profiles; copy data first").toBeTruthy();
            const authorId = String(profile.id);

            for (const [index, testCase] of CASES.entries()) {
              const slug = `neon-write-safety-probe-${index}`;
              const [row] = await tx.unsafe(
                `insert into public.posts
                   (title, slug, content, type, status, author_id, citation_id)
                 values ($1, $2, $3, $4, $5, $6, $7)
                 returning id, author_id, status, type, content_kind,
                           article_format, citation_id, published_version_id`,
                [
                  "Write safety probe",
                  slug,
                  "<p>probe</p>",
                  testCase.seed.type,
                  testCase.seed.status,
                  authorId,
                  testCase.seed.citation_id ?? null,
                ]
              );

              const snapshot: PostStateSnapshot = {
                id: String(row.id),
                author_id: String(row.author_id),
                status: row.status,
                type: row.type,
                content_kind: row.content_kind ?? null,
                article_format: row.article_format ?? null,
                citation_id: row.citation_id ?? null,
                published_version_id: row.published_version_id ?? null,
              };

              // A real version row, for the one case whose forbidden value
              // has a foreign key behind it.
              let statement = testCase.set;
              if (testCase.needsVersionRow) {
                const [version] = await tx.unsafe(
                  `insert into public.post_versions
                     (post_id, version_number, content, title, submitted_by)
                   values ($1, 1, $2, $3, $4)
                   returning id`,
                  [snapshot.id, "<p>probe</p>", "Write safety probe", authorId]
                );
                statement = statement.replace("$VERSION", String(version.id));
              }

              // --- half one: what Neon permits -------------------------
              const affected = testCase.del
                ? await tx.unsafe(
                    `delete from public.posts where id = $1 returning id`,
                    [snapshot.id]
                  )
                : await tx.unsafe(
                    `update public.posts set ${statement} where id = $1 returning id`,
                    [snapshot.id]
                  );

              if (affected.length > 0) acceptedByNeon.push(testCase.name);

              // --- half two: what the application permits ---------------
              const decision = testCase.policy(snapshot, {
                kind: "author",
                userId: snapshot.author_id,
              });
              if (!decision.allowed) refusedByPolicy.push(testCase.name);
            }

            // Always. Nothing above is meant to persist.
            throw new Error("__rollback__");
          })
          .catch((error: Error) => {
            if (error.message !== "__rollback__") throw error;
          });
      } finally {
        await sql.end({ timeout: 5 });
      }

      // The gap is real: Neon accepted every one of them.
      expect(
        acceptedByNeon.sort(),
        "Neon refused something, so the trigger may be live after all"
      ).toEqual(CASES.map((testCase) => testCase.name).sort());

      // And the application closes it.
      expect(
        refusedByPolicy.sort(),
        "the application layer let something through that Neon also lets through"
      ).toEqual(CASES.map((testCase) => testCase.name).sort());
    }, 180_000);

    it("still permits the legitimate flows against a real row shape", async () => {
      const { default: postgres } = await import("postgres");
      const sql = postgres(neonUrl!, {
        max: 1,
        prepare: false,
        connect_timeout: 20,
        onnotice: () => {},
      });

      try {
        await sql
          .begin(async (tx) => {
            const [profile] = await tx.unsafe(
              "select id from public.profiles limit 1"
            );
            const authorId = String(profile.id);

            const [row] = await tx.unsafe(
              `insert into public.posts (title, slug, content, type, status, author_id)
               values ($1, $2, $3, $4, $5, $6)
               returning id, author_id, status, type, content_kind,
                         article_format, citation_id, published_version_id`,
              [
                "Legitimate flow probe",
                "neon-write-safety-legit",
                "<p>probe</p>",
                "essay",
                "draft",
                authorId,
              ]
            );

            const snapshot: PostStateSnapshot = {
              id: String(row.id),
              author_id: String(row.author_id),
              status: row.status,
              type: row.type,
              content_kind: row.content_kind ?? null,
              article_format: row.article_format ?? null,
              citation_id: row.citation_id ?? null,
              published_version_id: row.published_version_id ?? null,
            };
            const actor: PostActor = {
              kind: "author",
              userId: snapshot.author_id,
            };

            // An author publishing their own essay, editing it, and deleting
            // a draft are all things the product does and must keep doing.
            expect(
              checkTransition({ actor, post: snapshot, nextStatus: "published" })
                .allowed
            ).toBe(true);
            expect(
              checkContentEdit(actor, snapshot, { title: "Edited" }).allowed
            ).toBe(true);
            expect(checkDelete(actor, snapshot).allowed).toBe(true);
            expect(canWriteToPost(actor, snapshot).allowed).toBe(true);

            throw new Error("__rollback__");
          })
          .catch((error: Error) => {
            if (error.message !== "__rollback__") throw error;
          });
      } finally {
        await sql.end({ timeout: 5 });
      }
    }, 180_000);
  }
);

describe.skipIf(enabled)("Neon write safety", () => {
  it("is skipped without a Neon scratch connection", () => {
    // Named, not silent: a green run must not be mistakable for a run that
    // actually happened.
    console.info(
      "[neon-write-safety] skipped: DATABASE_URL is not a Neon scratch connection string."
    );
    expect(enabled).toBe(false);
    expect(AUTHOR.kind).toBe("author");
  });
});
