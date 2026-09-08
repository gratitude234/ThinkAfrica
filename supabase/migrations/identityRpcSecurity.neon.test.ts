import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("server-only", () => ({}));

/**
 * BEHAVIOURAL SECURITY PROOF for the two identity migrations, against real
 * PostgreSQL.
 *
 * The sibling files assert what the SQL *says*. This one applies both
 * migrations to a scratch database inside a transaction, rolls it back, and
 * asserts what they *do*. The difference matters: a REVOKE that is written
 * correctly and a REVOKE that actually removes a privilege are not the same
 * claim, and the second is the one the security model rests on.
 *
 * Five questions, from the brief:
 *
 *   1. Does the right member get their own private projection?
 *   2. Can another normal member obtain it through the public RPC?
 *   3. Can an anonymous caller obtain it?
 *   4. Can the trusted repository path fetch it with an explicit id?
 *   5. Does a NULL actor broaden visibility?
 *
 * NOTHING IS PRINTED FROM THE PROJECTION. It contains a signup address. The
 * assertions compare ids and row counts, never payloads.
 *
 * Everything runs inside a transaction that is rolled back, so the scratch
 * database is unchanged. Neither migration is applied anywhere.
 */

const neonUrl = process.env.DATABASE_URL;
const enabled = Boolean(neonUrl && neonUrl.includes(".neon.tech"));

vi.setConfig({ testTimeout: 120_000 });

function migration(file: string): string {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8");
  // The files are self-contained transactions. Inside an outer transaction the
  // BEGIN/COMMIT would end it early and defeat the rollback, so they are
  // stripped and the outer transaction provides the boundary.
  return sql
    .replace(/^\s*BEGIN;\s*$/m, "")
    .replace(/^\s*COMMIT;\s*$/m, "")
    .replace(/^\s*SET LOCAL lock_timeout[^\n]*$/m, "");
}

const IDENTITY_RPCS = migration("20260909000001_parameterize_identity_rpcs.sql");
const PRIVATE_PROFILE = migration(
  "20260910000001_private_profile_explicit_user.sql"
);
/**
 * The scratch database still carries the earlier draft's public overloads: it
 * was applied there during Phase 4. Production does not have them. Applying
 * the cleanup here is what makes this test exercise the state an environment
 * is actually left in, rather than a clean-room one.
 */
const DROP_SUPERSEDED = migration(
  "20260910000002_drop_superseded_public_identity_overloads.sql"
);

/** The functions these migrations create. The scan is scoped to them, because
 *  `private` holds unrelated implementations from other features and this test
 *  is not their reviewer. */
const CREATED_IMPLEMENTATIONS = [
  "assert_identity_claim",
  "get_my_onboarding_state_impl",
  "save_onboarding_path_impl",
  "save_onboarding_preferences_impl",
  "save_onboarding_topics_impl",
  "set_notification_preference_impl",
  "toggle_comment_vote_impl",
  "get_my_profile_private_impl",
];

describe.skipIf(!enabled)("the identity migrations, applied and exercised", () => {
  let sql: Awaited<ReturnType<typeof open>>;

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
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  /**
   * Applies both migrations, runs the body, and always rolls back.
   *
   * `tx.unsafe` is the statement text, not the values: the migrations are files
   * on disk, not anything a request supplies.
   */
  async function withMigrations(
    body: (tx: {
      unsafe: (text: string, params?: unknown[]) => Promise<unknown>;
    }) => Promise<void>
  ) {
    await sql
      .begin(async (tx) => {
        await tx.unsafe(IDENTITY_RPCS);
        await tx.unsafe(PRIVATE_PROFILE);
        await tx.unsafe(DROP_SUPERSEDED);
        await body(tx as never);
        throw new Error("rollback");
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.message !== "rollback") throw error;
      });
  }

  /** Two real members. Ids only; nothing else about them is read. */
  async function twoMembers(tx: {
    unsafe: (text: string, params?: unknown[]) => Promise<unknown>;
  }) {
    const rows = (await tx.unsafe(
      "select id::text as id from public.profiles order by created_at limit 2"
    )) as Array<{ id: string }>;
    return rows;
  }

  async function actAs(
    tx: { unsafe: (text: string, params?: unknown[]) => Promise<unknown> },
    userId: string | null
  ) {
    // auth.uid() resolves through app_user_id() -> current_setting('app.user_id')
    // on this database, so this is how a signed-in caller is simulated.
    await tx.unsafe("select set_config('app.user_id', $1, true)", [userId ?? ""]);
  }

  it("puts every implementation in private and leaves none in public", async () => {
    await withMigrations(async (tx) => {
      const rows = (await tx.unsafe(
        `select n.nspname as schema, p.proname as name
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where p.proname in (select jsonb_array_elements_text($1::text::jsonb))
         order by 1, 2`,
        [JSON.stringify(CREATED_IMPLEMENTATIONS)]
      )) as Array<{ schema: string; name: string }>;

      expect(rows.length).toBe(CREATED_IMPLEMENTATIONS.length);

      // One in `public` would be the whole vulnerability. This also proves the
      // cleanup migration removed the earlier draft's public guard, which the
      // scratch database still had.
      for (const row of rows) {
        expect(row.schema, `${row.name} must be private`).toBe("private");
      }
    });
  });

  it("removes the earlier draft's public explicit-id overloads", async () => {
    await withMigrations(async (tx) => {
      const rows = (await tx.unsafe(
        `select p.proname as name,
                pg_get_function_identity_arguments(p.oid) as args
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in (
             'get_my_onboarding_state', 'save_onboarding_path',
             'save_onboarding_preferences', 'save_onboarding_topics',
             'set_notification_preference', 'toggle_comment_vote'
           )
           and pg_get_function_identity_arguments(p.oid) like 'p_user_id uuid%'`
      )) as Array<{ name: string; args: string }>;

      expect(rows).toEqual([]);
    });
  });

  it("keeps every zero-argument wrapper the application calls", async () => {
    await withMigrations(async (tx) => {
      const rows = (await tx.unsafe(
        `select p.proname as name
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in (
             'get_my_onboarding_state', 'save_onboarding_path',
             'save_onboarding_preferences', 'save_onboarding_topics',
             'set_notification_preference', 'toggle_comment_vote',
             'get_my_profile_private'
           )
           and pg_get_function_identity_arguments(p.oid) not like 'p_user_id uuid%'
         order by 1`
      )) as Array<{ name: string }>;

      // Dropping one of these would be an outage. The cleanup names an
      // argument list beginning with uuid precisely so it cannot reach them.
      expect(rows.map((row) => row.name).sort()).toEqual([
        "get_my_onboarding_state",
        "get_my_profile_private",
        "save_onboarding_path",
        "save_onboarding_preferences",
        "save_onboarding_topics",
        "set_notification_preference",
        "toggle_comment_vote",
      ]);
    });
  });

  // ── 1. the right member gets their own projection ──────────────────

  it("gives a member their own private profile through the public RPC", async () => {
    await withMigrations(async (tx) => {
      const [a] = await twoMembers(tx);
      if (!a) return;

      await actAs(tx, a.id);
      const rows = (await tx.unsafe(
        "select profile_id::text as profile_id from public.get_my_profile_private()"
      )) as Array<{ profile_id: string }>;

      expect(rows).toHaveLength(1);
      expect(rows[0].profile_id).toBe(a.id);
    });
  });

  // ── 2. another member cannot obtain it ─────────────────────────────

  it("gives a different member their own row, never the first member's", async () => {
    await withMigrations(async (tx) => {
      const [a, b] = await twoMembers(tx);
      if (!a || !b) return;

      await actAs(tx, b.id);
      const rows = (await tx.unsafe(
        "select profile_id::text as profile_id from public.get_my_profile_private()"
      )) as Array<{ profile_id: string }>;

      expect(rows).toHaveLength(1);
      expect(rows[0].profile_id).toBe(b.id);
      expect(rows[0].profile_id).not.toBe(a.id);
    });
  });

  it("refuses a signed-in caller who names somebody else", async () => {
    await withMigrations(async (tx) => {
      const [a, b] = await twoMembers(tx);
      if (!a || !b) return;

      await actAs(tx, b.id);

      // Defence in depth. The control that matters is that `authenticated`
      // cannot reach this function at all; this is what makes a future grant
      // mistake fail loudly rather than silently.
      await expect(
        tx.unsafe(
          "select 1 from private.get_my_profile_private_impl($1::uuid)",
          [a.id]
        )
      ).rejects.toThrow(/may only act as itself/i);
    });
  });

  it("does not let authenticated or anon execute any implementation", async () => {
    await withMigrations(async (tx) => {
      const rows = (await tx.unsafe(
        `select
           p.proname as name,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'private'
           and p.proname in (select jsonb_array_elements_text($1::text::jsonb))
         order by 1`,
        [JSON.stringify(CREATED_IMPLEMENTATIONS)]
      )) as Array<{ name: string; authenticated: boolean; anon: boolean }>;

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.authenticated, `${row.name} must not be executable by authenticated`).toBe(false);
        expect(row.anon, `${row.name} must not be executable by anon`).toBe(false);
      }
    });
  });

  it("does not let authenticated or anon use the private schema at all", async () => {
    await withMigrations(async (tx) => {
      const rows = (await tx.unsafe(
        `select
           has_schema_privilege('authenticated', 'private', 'USAGE') as authenticated,
           has_schema_privilege('anon', 'private', 'USAGE') as anon`
      )) as Array<{ authenticated: boolean; anon: boolean }>;

      // The second of the two independent mechanisms. Even a mistaken GRANT on
      // a function would not be reachable without USAGE on the schema.
      expect(rows[0].authenticated).toBe(false);
      expect(rows[0].anon).toBe(false);
    });
  });

  it("keeps the public wrapper executable by authenticated, as before", async () => {
    await withMigrations(async (tx) => {
      const rows = (await tx.unsafe(
        `select
           has_function_privilege('authenticated', 'public.get_my_profile_private()', 'EXECUTE') as authenticated,
           has_function_privilege('anon', 'public.get_my_profile_private()', 'EXECUTE') as anon`
      )) as Array<{ authenticated: boolean; anon: boolean }>;

      expect(rows[0].authenticated).toBe(true);
      expect(rows[0].anon).toBe(false);
    });
  });

  // ── 3. anonymous callers ───────────────────────────────────────────

  it("returns no row to an anonymous caller, and does not raise", async () => {
    await withMigrations(async (tx) => {
      await actAs(tx, null);

      const rows = (await tx.unsafe(
        "select profile_id::text as profile_id from public.get_my_profile_private()"
      )) as Array<{ profile_id: string }>;

      // No row, not an error: the settings page relies on this, and an
      // exception here would be a visible regression for signed-out visitors.
      expect(rows).toHaveLength(0);
    });
  });

  // ── 4. the trusted repository path ─────────────────────────────────

  it("lets a trusted caller fetch a member's projection by explicit id", async () => {
    await withMigrations(async (tx) => {
      const [a] = await twoMembers(tx);
      if (!a) return;

      // No session on the connection, which is what a direct PostgreSQL
      // repository looks like. The parameter is authoritative.
      await actAs(tx, null);

      const rows = (await tx.unsafe(
        "select profile_id::text as profile_id from private.get_my_profile_private_impl($1::uuid)",
        [a.id]
      )) as Array<{ profile_id: string }>;

      expect(rows).toHaveLength(1);
      expect(rows[0].profile_id).toBe(a.id);
    });
  });

  it("returns the same projection through both paths, column for column", async () => {
    await withMigrations(async (tx) => {
      const [a] = await twoMembers(tx);
      if (!a) return;

      await actAs(tx, a.id);
      const viaWrapper = (await tx.unsafe(
        "select to_jsonb(t) as row from public.get_my_profile_private() t"
      )) as Array<{ row: Record<string, unknown> }>;

      await actAs(tx, null);
      const viaImpl = (await tx.unsafe(
        "select to_jsonb(t) as row from private.get_my_profile_private_impl($1::uuid) t",
        [a.id]
      )) as Array<{ row: Record<string, unknown> }>;

      expect(viaWrapper).toHaveLength(1);
      expect(viaImpl).toHaveLength(1);

      // Compared by key set and by equality, never printed: this projection
      // carries a signup address.
      expect(Object.keys(viaImpl[0].row).sort()).toEqual(
        Object.keys(viaWrapper[0].row).sort()
      );
      expect(viaImpl[0].row).toEqual(viaWrapper[0].row);
    });
  });

  // ── 5. a null actor must not broaden visibility ────────────────────

  it("raises on a null id rather than matching every profile", async () => {
    await withMigrations(async (tx) => {
      await actAs(tx, null);

      // The failure this guards against is the one auth.uid() produces off
      // Supabase: a predicate that quietly matches nothing, or worse,
      // everything. Raising is the only acceptable answer for a trusted
      // caller that forgot to resolve its viewer.
      await expect(
        tx.unsafe("select 1 from private.get_my_profile_private_impl(null::uuid)")
      ).rejects.toThrow(/user id is required/i);
    });
  });

  it("never returns more than one row, whoever asks", async () => {
    await withMigrations(async (tx) => {
      const [a] = await twoMembers(tx);
      if (!a) return;

      const [{ total }] = (await tx.unsafe(
        "select count(*)::int as total from public.profiles"
      )) as Array<{ total: number }>;
      expect(total).toBeGreaterThan(1);

      await actAs(tx, a.id);
      const rows = (await tx.unsafe(
        "select 1 from public.get_my_profile_private()"
      )) as unknown[];

      // If the filter ever became `WHERE NULL IS NULL` or similar, this is the
      // assertion that catches it: one row, not the whole table.
      expect(rows).toHaveLength(1);
    });
  });

  // ── the six from 20260909000001, same model ────────────────────────

  it("lets a trusted caller reach the onboarding state by explicit id", async () => {
    await withMigrations(async (tx) => {
      const [a] = await twoMembers(tx);
      if (!a) return;

      await actAs(tx, null);
      const trusted = (await tx.unsafe(
        "select 1 from private.get_my_onboarding_state_impl($1::uuid)",
        [a.id]
      )) as unknown[];
      expect(Array.isArray(trusted)).toBe(true);

      const [privilege] = (await tx.unsafe(
        `select has_function_privilege('authenticated', 'private.get_my_onboarding_state_impl(uuid)', 'EXECUTE') as granted`
      )) as Array<{ granted: boolean }>;
      expect(privilege.granted).toBe(false);
    });
  });

  it("raises on a null id in the onboarding state function too", async () => {
    // Its own transaction: a statement that raises aborts the one it is in,
    // and every later statement then fails for an unrelated reason.
    await withMigrations(async (tx) => {
      await expect(
        tx.unsafe("select 1 from private.get_my_onboarding_state_impl(null::uuid)")
      ).rejects.toThrow(/user id is required/i);
    });
  });

  it("leaves the zero-argument onboarding wrapper working for a signed-in caller", async () => {
    await withMigrations(async (tx) => {
      const [a] = await twoMembers(tx);
      if (!a) return;

      await actAs(tx, a.id);
      const rows = (await tx.unsafe(
        "select 1 from public.get_my_onboarding_state()"
      )) as unknown[];

      // Zero rows is a valid answer (the member may have no preferences row).
      // What must not happen is an error, which is what a wrapper unable to
      // reach `private` would produce.
      expect(Array.isArray(rows)).toBe(true);
    });
  });
});
