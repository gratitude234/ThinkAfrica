import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The contracts 20260909000001_parameterize_identity_rpcs.sql has to satisfy.
 *
 * There is no local migration runner, so this file asserts the properties that
 * would otherwise only fail in production, the same way
 * emailBroadcastsMigration.test.ts and databaseTelemetryMigration.test.ts do.
 *
 * Three failure modes are being guarded against, and each is silent:
 *
 *   1. Impersonation. The explicit-id form must not be reachable by a browser.
 *      An earlier draft made it a public overload granted to `authenticated`
 *      and relied on a runtime guard that had to exempt callers with no JWT.
 *      That made impersonation a question about who can mint a token rather
 *      than about who is granted what, so the implementation moved to
 *      `private` and the grant went away.
 *   2. A broken existing caller. The migration is additive: every original
 *      signature keeps its name, its arguments and its behaviour.
 *   3. A write that reports success without changing anything. That is what
 *      `where user_id = auth.uid()` does once auth.uid() is NULL.
 */

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260909000001_parameterize_identity_rpcs.sql"
  ),
  "utf8"
);

/** Executable SQL only. Prose describing a pattern must not satisfy a check
 *  for that pattern, and this file's header discusses the design it replaced. */
const executable = migration
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

/** The functions this migration parameterises: the original public signature,
 *  and the private implementation the body moved into. */
const PARAMETERISED = [
  { name: "get_my_onboarding_state", oldArgs: "", implArgs: "uuid" },
  { name: "save_onboarding_path", oldArgs: "text", implArgs: "uuid, text" },
  {
    name: "save_onboarding_preferences",
    oldArgs: "text, text",
    implArgs: "uuid, text, text",
  },
  { name: "save_onboarding_topics", oldArgs: "text[]", implArgs: "uuid, text[]" },
  {
    name: "set_notification_preference",
    oldArgs: "text, boolean",
    implArgs: "uuid, text, boolean",
  },
  { name: "toggle_comment_vote", oldArgs: "uuid", implArgs: "uuid, uuid" },
] as const;

describe("the migration's shape", () => {
  it("is one transaction with a lock timeout", () => {
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
    expect(migration).toContain("SET LOCAL lock_timeout");
  });

  it("drops nothing and alters no existing signature", () => {
    // Additive is what makes this deployable while the application still calls
    // the old signatures. A DROP here would be an outage.
    expect(executable).not.toMatch(/\bDROP\s+FUNCTION\b/i);
    expect(executable).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(executable).not.toMatch(/\bALTER\s+TABLE\b/i);
  });

  it("documents how to roll back", () => {
    expect(migration).toMatch(/ROLLBACK/);
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS private.assert_identity_claim(uuid)"
    );
  });
});

describe("the security model", () => {
  it("puts every explicit-id implementation in private, never in public", () => {
    // PostgREST exposes only `public`, so a function in `private` cannot be
    // named by a request. That is the first of the two mechanisms; the grant
    // below is the second.
    for (const { name } of PARAMETERISED) {
      expect(
        executable,
        `${name} implementation must live in private`
      ).toContain(`FUNCTION private.${name}_impl(`);
      expect(
        executable,
        `${name} must not have a public explicit-id overload`
      ).not.toMatch(
        new RegExp(`FUNCTION public\\.${name}\\(\\s*\\n?\\s*p_user_id uuid`)
      );
    }
  });

  it("grants no implementation to anon, authenticated or PUBLIC", () => {
    // The wrappers reach these as their owner, so no grant is needed for the
    // application to work. A GRANT here would be the whole vulnerability.
    const grants = executable.match(
      /GRANT EXECUTE ON FUNCTION private\.[^\n]*/g
    );
    expect(grants, "no private implementation may be granted").toBeNull();
  });

  it("revokes each implementation explicitly, so the intent is visible", () => {
    for (const { name, implArgs } of PARAMETERISED) {
      expect(executable).toContain(
        `REVOKE ALL ON FUNCTION private.${name}_impl(${implArgs}) FROM public, anon, authenticated;`
      );
    }
    expect(executable).toContain(
      "REVOKE ALL ON FUNCTION private.assert_identity_claim(uuid) FROM public, anon, authenticated;"
    );
  });

  it("keeps every public wrapper at the posture the original had", () => {
    for (const { name, oldArgs } of PARAMETERISED) {
      expect(executable).toContain(
        `REVOKE ALL ON FUNCTION public.${name}(${oldArgs}) FROM public, anon;`
      );
      expect(executable).toContain(
        `GRANT EXECUTE ON FUNCTION public.${name}(${oldArgs}) TO authenticated, service_role;`
      );
    }
  });

  it("pins every search_path to the empty string", () => {
    // A SECURITY DEFINER function with a mutable schema on its search_path is
    // the classic escalation route. Every body here is schema-qualified, so
    // there is no reason for `public` to be searchable.
    expect(executable).not.toMatch(/SET search_path = public\b/);
    const pinned = executable.match(/SET search_path = ''/g) ?? [];
    const definitions = executable.match(/CREATE OR REPLACE FUNCTION/g) ?? [];
    expect(pinned.length).toBe(definitions.length);
  });
});

describe("assert_identity_claim", () => {
  const body = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION private.assert_identity_claim"),
    migration.indexOf("COMMENT ON FUNCTION private.assert_identity_claim")
  );

  it("refuses a null identity rather than treating it as nobody", () => {
    // `where user_id = null` is a no-op that reports success. That is what
    // must become an error.
    expect(body).toMatch(/IF p_user_id IS NULL THEN[\s\S]*?RAISE EXCEPTION/);
    expect(body).toContain("42501");
  });

  it("refuses a signed-in caller acting as somebody else", () => {
    expect(body).toMatch(/v_claimed <> p_user_id[\s\S]*?RAISE EXCEPTION/);
  });

  it("trusts a caller with no JWT, which is what the parameter is for", () => {
    // A direct connection has no auth.uid(). This is no longer load-bearing
    // for security -- `private` being unreachable is -- but it is what lets
    // the trusted path work at all.
    expect(body).toMatch(/IF v_claimed IS NULL THEN\s*RETURN p_user_id;/);
  });

  it("pins its search_path, so the guard cannot be shadowed", () => {
    expect(body).toContain("SET search_path");
  });
});

describe("each parameterised implementation", () => {
  for (const { name } of PARAMETERISED) {
    it(`${name}_impl takes p_user_id first and runs it through the guard`, () => {
      const header = new RegExp(
        `CREATE OR REPLACE FUNCTION private\\.${name}_impl\\(\\s*\\n?\\s*p_user_id uuid`
      );
      expect(migration, `${name}_impl must take p_user_id first`).toMatch(header);

      const start = migration.indexOf(`FUNCTION private.${name}_impl(`);
      const definition = migration.slice(
        start,
        migration.indexOf("-- ---", start) >= 0
          ? migration.indexOf("-- ---", start)
          : start + 3000
      );
      expect(definition, `${name}_impl must call assert_identity_claim`).toContain(
        "private.assert_identity_claim(p_user_id)"
      );
    });

    it(`${name} still exists under its original signature`, () => {
      const wrapper = new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${name}\\((?!\\s*\\n?\\s*p_user_id)`
      );
      expect(migration, `${name} lost its original signature`).toMatch(wrapper);
    });

    it(`${name}_impl keeps SECURITY DEFINER and an explicit search_path`, () => {
      const start = migration.indexOf(`FUNCTION private.${name}_impl(`);
      const definition = migration.slice(start, start + 900);
      expect(definition).toMatch(/SECURITY DEFINER/i);
      expect(definition).toMatch(/SET search_path/i);
    });
  }
});

describe("the wrappers", () => {
  it("delegate to the private implementation rather than reimplementing it", () => {
    // One body per function. A wrapper that repeated the logic could drift
    // from it, and drift between two copies of an authorization rule is worse
    // than either copy.
    for (const { name } of PARAMETERISED) {
      expect(migration, `${name} wrapper must delegate`).toMatch(
        new RegExp(
          `SELECT (\\* FROM )?private\\.${name}_impl\\(\\s*\\n?\\s*\\(SELECT auth\\.uid\\(\\)\\)`
        )
      );
    }
  });

  it("are SECURITY DEFINER, which is how they reach a schema the caller cannot", () => {
    // Without this the wrapper would need the caller to hold USAGE on
    // `private`, which is exactly what must never be granted.
    for (const { name } of PARAMETERISED) {
      const start = migration.indexOf(`FUNCTION public.${name}(`);
      const definition = migration.slice(start, start + 600);
      expect(definition, `${name} wrapper must be SECURITY DEFINER`).toMatch(
        /SECURITY DEFINER/i
      );
    }
  });
});

describe("write paths", () => {
  it("check that the row they meant to change existed", () => {
    // An UPDATE that matches nothing reports success. Under auth.uid() that is
    // exactly how a preference switch or a topic save silently does nothing.
    const topics = migration.slice(
      migration.indexOf("FUNCTION private.save_onboarding_topics_impl(\n  p_user_id"),
      migration.indexOf(
        "-- ===========================================================================\n-- Notifications"
      )
    );
    expect(topics).toMatch(/IF NOT FOUND THEN[\s\S]*?RAISE EXCEPTION/);

    const preference = migration.slice(
      migration.indexOf(
        "FUNCTION private.set_notification_preference_impl(\n  p_user_id"
      ),
      migration.indexOf("FUNCTION public.set_notification_preference(\n  p_key")
    );
    expect(preference).toMatch(/IF NOT FOUND THEN[\s\S]*?RAISE EXCEPTION/);
  });
});

describe("the application", () => {
  it("does not call the parameterised signatures yet", () => {
    // The migration is not applied. A caller sending p_user_id today would get
    // "Could not find the function ... in the schema cache" from PostgREST,
    // which is why the rollout in docs/rpc-identity-migration.md is a separate
    // step from writing the SQL.
    const callers = [
      "app/(main)/settings/profileActions.ts",
      "app/(onboarding)/onboarding/OnboardingClient.tsx",
      "app/(main)/post/[slug]/CommentThread.tsx",
    ];
    for (const caller of callers) {
      const source = readFileSync(resolve(process.cwd(), caller), "utf8");
      expect(source, `${caller} must not send p_user_id yet`).not.toContain(
        "p_user_id"
      );
    }
  });
});
