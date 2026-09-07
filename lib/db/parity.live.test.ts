import { describe, expect, it, vi } from "vitest";

/**
 * The live differential: the same slugs, through both adapters, against two
 * real databases.
 *
 * This is the acceptance gate for pointing the post domain at Neon. It is a
 * test rather than a standalone script because the modules it has to exercise
 * are the application's own, with `@/` aliases, TypeScript and a `server-only`
 * import; a script would need a build step or a hand-rolled type stripper, and
 * the second of those is how a harness ends up testing something other than
 * the code it claims to.
 *
 * Skipped, loudly, unless all three credentials are present. Run it with:
 *
 *   node scripts/migration/parity-check.mjs
 *
 * which checks the environment first and says what is missing.
 *
 * READ-ONLY on both sides: one SELECT per slug per adapter.
 *
 * On the Supabase side this uses the service-role key with the *same*
 * projection and filters as lib/db/supabase/posts.ts, imported rather than
 * retyped. The application normally reads through lib/supabase/server.ts,
 * which needs a request's cookies. Service role bypasses RLS, and that
 * difference is the point of the visibility cases below: they are the ones
 * where RLS and the application's own status gate have to agree.
 */

vi.mock("server-only", () => ({}));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const neonUrl = process.env.DATABASE_URL;
const enabled = Boolean(supabaseUrl && serviceKey && neonUrl);

const { POST_CORE_SELECT } = await import("@/lib/db/supabase/posts");
const { POST_BY_SLUG_SQL, toPostRecord } = await import("@/lib/db/postgres/posts");
const { VISIBLE_POST_STATUSES } = await import("@/lib/db/types");
type PostRecord = import("@/lib/db/types").PostRecord;
const { comparePostRecords, formatParityReport } = await import("@/lib/db/parity");

describe.skipIf(!enabled)("adapter parity against live databases", () => {
  it("returns behaviourally identical results for a representative set of slugs", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const { default: postgres } = await import("postgres");

    const supabase = createClient(supabaseUrl!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // The application's own pool options, not a convenient subset. Building a
    // client here with different options is how this harness reported 12/12
    // while the real runtime was returning 500s on every post page:
    // fetch_types: false changes how parameters are serialised, and a parity
    // check that does not set it is testing a driver the application never uses.
    const { POSTGRES_POOL_OPTIONS } = await import("@/lib/db/postgres/connection");
    const sql = postgres(neonUrl!, {
      ...POSTGRES_POOL_OPTIONS,
      max: 1,
      connect_timeout: 15,
      onnotice: () => {},
    });

    try {
      /**
       * The cases, chosen to exercise what a happy-path check would miss. A
       * parity run over seven published articles proves the easy half.
       */
      const cases: Array<{ slug: string; label: string }> = [];

      const collect = async (
        label: string,
        build: () => PromiseLike<{ data: Array<{ slug: string }> | null; error: unknown }>
      ) => {
        const { data } = await build();
        for (const row of data ?? []) cases.push({ slug: row.slug, label });
      };

      await collect("published article", () =>
        supabase
          .from("posts")
          .select("slug")
          .eq("status", "published")
          .eq("content_kind", "article")
          .limit(3)
      );
      await collect("published short post", () =>
        supabase
          .from("posts")
          .select("slug")
          .eq("status", "published")
          .eq("content_kind", "post")
          .limit(2)
      );
      await collect("response", () =>
        supabase
          .from("posts")
          .select("slug")
          .eq("status", "published")
          .not("in_response_to", "is", null)
          .limit(2)
      );
      await collect("in-review post", () =>
        supabase
          .from("posts")
          .select("slug")
          .in("status", ["pending", "pending_revision"])
          .limit(2)
      );
      await collect("draft", () =>
        supabase.from("posts").select("slug").eq("status", "draft").limit(2)
      );
      await collect("rejected post, must resolve to nothing", () =>
        supabase.from("posts").select("slug").eq("status", "rejected").limit(1)
      );
      await collect("post carrying a document", () =>
        supabase.from("posts").select("slug").not("document_path", "is", null).limit(1)
      );

      cases.push({ slug: "a-slug-that-does-not-exist-000000", label: "nonexistent slug" });

      // A run over one nonexistent slug would pass and prove nothing.
      expect(
        cases.length,
        "the Neon scratch database appears to hold no posts; copy data first"
      ).toBeGreaterThan(1);

      const results = [];
      for (const { slug } of cases) {
        const [left, right] = await Promise.all([
          supabase
            .from("posts")
            .select(POST_CORE_SELECT)
            .eq("slug", slug)
            .in("status", [...VISIBLE_POST_STATUSES])
            .maybeSingle()
            .then(({ data, error }) => {
              if (error) throw new Error(`supabase: ${error.message}`);
              return (data as PostRecord | null) ?? null;
            }),
          sql
            .unsafe(POST_BY_SLUG_SQL, [slug, ...VISIBLE_POST_STATUSES])
            .then((rows) => {
              const list = rows as unknown as Record<string, unknown>[];
              if (list.length > 1) {
                throw new Error(`postgres: slug matched ${list.length} rows`);
              }
              return list.length === 0 ? null : toPostRecord(list[0]);
            }),
        ]);

        results.push(comparePostRecords(slug, left, right));
      }

      const report = formatParityReport(results);
      // Printed whether or not it passes: the report is the deliverable.
      console.info(`\n${report}\n`);

      expect(results.filter((result) => !result.matches), report).toEqual([]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 120_000);
});

describe.skipIf(enabled)("adapter parity against live databases", () => {
  it("is skipped until a Neon scratch database exists", () => {
    // Not a silent skip. The missing values are named, so a green run cannot
    // be mistaken for a parity run that actually happened.
    const missing = [
      !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
      !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
      !neonUrl && "DATABASE_URL (Neon scratch)",
    ].filter(Boolean);

    console.info(
      `[parity] live differential not run. Missing: ${missing.join(", ")}. ` +
        "See scripts/migration/README.md."
    );
    expect(missing.length).toBeGreaterThan(0);
  });
});
