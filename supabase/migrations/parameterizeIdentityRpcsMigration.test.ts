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
 * What matters here is not that the SQL is pretty. It is that the migration is
 * additive (every existing caller keeps working), that no parameterised
 * function can be made to act as someone else, and that no write reports
 * success without checking it affected a row. All three are the failure modes
 * auth.uid() produces when it starts returning NULL.
 */

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260909000001_parameterize_identity_rpcs.sql"
  ),
  "utf8"
);

/** The functions this migration parameterises, with the original signature's
 *  argument list and the new one's. */
const PARAMETERISED = [
  { name: "get_my_onboarding_state", oldArgs: "", newArgs: "uuid" },
  { name: "save_onboarding_path", oldArgs: "text", newArgs: "uuid, text" },
  {
    name: "save_onboarding_preferences",
    oldArgs: "text, text",
    newArgs: "uuid, text, text",
  },
  { name: "save_onboarding_topics", oldArgs: "text[]", newArgs: "uuid, text[]" },
  {
    name: "set_notification_preference",
    oldArgs: "text, boolean",
    newArgs: "uuid, text, boolean",
  },
  { name: "toggle_comment_vote", oldArgs: "uuid", newArgs: "uuid, uuid" },
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
    const executable = migration
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    expect(executable).not.toMatch(/\bDROP\s+FUNCTION\b/i);
    expect(executable).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(executable).not.toMatch(/\bALTER\s+TABLE\b/i);
  });

  it("documents how to roll back", () => {
    expect(migration).toMatch(/ROLLBACK/);
    expect(migration).toContain("DROP FUNCTION IF EXISTS public.assert_identity_claim(uuid)");
  });
});

describe("assert_identity_claim", () => {
  const body = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.assert_identity_claim"),
    migration.indexOf("COMMENT ON FUNCTION public.assert_identity_claim")
  );

  it("refuses a null identity rather than treating it as nobody", () => {
    // This is the entire point of the migration. `where user_id = null` is a
    // no-op that reports success, and that is what must become an error.
    expect(body).toMatch(/IF p_user_id IS NULL THEN[\s\S]*?RAISE EXCEPTION/);
    expect(body).toContain("42501");
  });

  it("refuses a signed-in caller acting as somebody else", () => {
    expect(body).toMatch(/v_claimed <> p_user_id[\s\S]*?RAISE EXCEPTION/);
  });

  it("trusts a caller with no JWT, which is what the parameter is for", () => {
    // service_role today, a direct connection later. Both have no auth.uid().
    expect(body).toMatch(/IF v_claimed IS NULL THEN\s*RETURN p_user_id;/);
  });

  it("pins its search_path, so the guard cannot be shadowed", () => {
    expect(body).toContain("SET search_path");
  });
});

describe("each parameterised function", () => {
  for (const { name, newArgs } of PARAMETERISED) {
    it(`${name} takes p_user_id first and runs it through the guard`, () => {
      const header = new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${name}\\(\\s*\\n?\\s*p_user_id uuid`
      );
      expect(migration, `${name} must take p_user_id first`).toMatch(header);
      // The guard is the only way an id becomes trusted. A function that reads
      // p_user_id directly would accept anything the caller sent.
      const definition = migration.slice(
        migration.indexOf(`FUNCTION public.${name}(\n  p_user_id uuid`) >= 0
          ? migration.indexOf(`FUNCTION public.${name}(\n  p_user_id uuid`)
          : migration.indexOf(`FUNCTION public.${name}(p_user_id uuid`),
        migration.indexOf(`-- ---`, migration.indexOf(`FUNCTION public.${name}(`))
      );
      expect(definition, `${name} must call assert_identity_claim`).toContain(
        "assert_identity_claim(p_user_id)"
      );
    });

    it(`${name} still exists under its original signature`, () => {
      // PostgREST resolves an overload by the argument names in the request
      // body, so an existing caller sending the old names must still land on a
      // function that exists.
      const wrapper = new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${name}\\((?!\\s*\\n?\\s*p_user_id)`
      );
      expect(migration, `${name} lost its original signature`).toMatch(wrapper);
    });

    it(`${name} is granted to authenticated and service_role, never anon`, () => {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION public.${name}(${newArgs}) FROM public, anon;`
      );
      expect(migration).toContain(
        `GRANT EXECUTE ON FUNCTION public.${name}(${newArgs}) TO authenticated, service_role;`
      );
    });

    it(`${name} keeps SECURITY DEFINER and an explicit search_path`, () => {
      const start = migration.indexOf(`FUNCTION public.${name}(`);
      const definition = migration.slice(start, start + 900);
      expect(definition).toMatch(/SECURITY DEFINER/i);
      expect(definition).toMatch(/SET search_path/i);
    });
  }
});

describe("the wrappers", () => {
  it("pass auth.uid() through rather than reimplementing anything", () => {
    // One body per function. A wrapper that repeated the logic could drift
    // from it, and drift between two copies of an authorization rule is worse
    // than either copy.
    for (const { name } of PARAMETERISED) {
      expect(migration, `${name} wrapper must delegate`).toMatch(
        new RegExp(
          `SELECT (\\* FROM )?public\\.${name}\\(\\s*\\n?\\s*\\(SELECT auth\\.uid\\(\\)\\)`
        )
      );
    }
  });
});

describe("write paths", () => {
  it("check that the row they meant to change existed", () => {
    // An UPDATE that matches nothing reports success. Under auth.uid() that is
    // exactly how a preference switch or a topic save silently does nothing.
    const topics = migration.slice(
      migration.indexOf("FUNCTION public.save_onboarding_topics(\n  p_user_id"),
      migration.indexOf("-- ===========================================================================\n-- Notifications")
    );
    expect(topics).toMatch(/IF NOT FOUND THEN[\s\S]*?RAISE EXCEPTION/);

    const preference = migration.slice(
      migration.indexOf("FUNCTION public.set_notification_preference(\n  p_user_id"),
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
