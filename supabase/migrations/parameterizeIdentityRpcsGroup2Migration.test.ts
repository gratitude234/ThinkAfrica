import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The contracts 20260910000001_parameterize_identity_rpcs_group2.sql has to
 * satisfy.
 *
 * There is no local migration runner, so this asserts what would otherwise
 * only fail in production, the same way
 * parameterizeIdentityRpcsMigration.test.ts does for group 1.
 *
 * Two things are tested here that group 1 did not need, because they are the
 * reasons these three were deferred in the first place:
 *
 *   1. **The bodies came from the catalogue, not from a migration file.** For
 *      `withdraw_post_submission` the LATER file is the stale one, so a port
 *      written from "the most recent migration" would be wrong. The assertions
 *      below pin body content that only the live definition has.
 *   2. **`withdraw_post_submission` keeps its own gate.** Its UPDATE's WHERE
 *      clause is the sole authorization on that path, because
 *      `guard_locked_post_write()` deliberately bypasses inside a
 *      SECURITY DEFINER function. Losing a conjunct there is not a style
 *      regression, it is an authorization hole.
 */

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260910000001_parameterize_identity_rpcs_group2.sql"
  ),
  "utf8"
);

const PARAMETERISED = [
  {
    name: "save_onboarding_identity",
    newArgs: "uuid, text, text, text, text, text, integer, text, text",
  },
  { name: "complete_onboarding", newArgs: "uuid" },
  { name: "withdraw_post_submission", newArgs: "uuid, uuid" },
] as const;

/**
 * Everything from one parameterised function's CREATE to the next CREATE.
 *
 * The signature is matched with `p_user_id` required as the first argument,
 * on the same line or the next one, so this both locates the definition and
 * asserts the argument order. A body found by name alone would be the wrapper
 * as often as the real one.
 */
function definitionOf(name: string): string {
  const header = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\(\\s*p_user_id uuid`
  );
  const match = header.exec(migration);
  expect(match, `${name} must take p_user_id first`).not.toBeNull();
  const start = match!.index;
  const end = migration.indexOf("CREATE OR REPLACE FUNCTION", start + 1);
  return migration.slice(start, end === -1 ? undefined : end);
}

describe("the migration's shape", () => {
  it("is one transaction with a lock timeout", () => {
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
    expect(migration).toContain("SET LOCAL lock_timeout");
  });

  it("drops nothing and alters no existing signature", () => {
    const executable = migration
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    expect(executable).not.toMatch(/\bDROP\s+FUNCTION\b/i);
    expect(executable).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(executable).not.toMatch(/\bALTER\s+TABLE\b/i);
  });

  it("says it is not applied, where somebody opening the file will see it", () => {
    expect(migration.slice(0, 700)).toContain("NOT APPLIED");
  });

  it("documents how to roll back, and where the bodies came from", () => {
    expect(migration).toMatch(/ROLLBACK/);
    // The rollback restores from the catalogue, not from the migration files,
    // which is the whole lesson of this group.
    expect(migration).toContain("read-function-defs.mjs");
  });

  it("depends on group 1 rather than redefining the guard", () => {
    // Two definitions of assert_identity_claim is two things that can drift.
    expect(migration).not.toMatch(
      /CREATE OR REPLACE FUNCTION public\.assert_identity_claim/
    );
    expect(migration).toContain("20260909000001");
  });
});

describe("each parameterised function", () => {
  for (const { name, newArgs } of PARAMETERISED) {
    it(`${name} runs its id through the guard rather than trusting it`, () => {
      expect(definitionOf(name)).toContain("assert_identity_claim(p_user_id)");
    });

    it(`${name} never reads auth.uid() inside the parameterised body`, () => {
      // A body that still consults auth.uid() would work on Supabase and fail
      // silently on Neon, which is the exact bug being removed.
      expect(definitionOf(name)).not.toContain("auth.uid()");
    });

    it(`${name} still exists under its original signature`, () => {
      const wrapper = new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${name}\\((?!\\s*\\n?\\s*p_user_id)`
      );
      expect(migration, `${name} lost its original signature`).toMatch(wrapper);
    });

    it(`${name} is granted to authenticated and service_role, never anon`, () => {
      // A nine-argument signature is wrapped across lines and a one-argument
      // one is not, so the comparison collapses whitespace and the padding
      // inside the parentheses. What is asserted is the grant, not its layout.
      const flatten = (text: string) =>
        text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
      const normalised = flatten(migration);

      expect(normalised).toContain(
        flatten(`REVOKE ALL ON FUNCTION public.${name}(${newArgs}) FROM public, anon;`)
      );
      expect(normalised).toContain(
        flatten(
          `GRANT EXECUTE ON FUNCTION public.${name}(${newArgs}) TO authenticated, service_role;`
        )
      );
    });

    it(`${name} keeps SECURITY DEFINER and an explicit search_path`, () => {
      const definition = definitionOf(name);
      expect(definition).toContain("SECURITY DEFINER");
      expect(definition).toContain("SET search_path");
    });
  }
});

describe("save_onboarding_identity: the live body, not the older one", () => {
  const definition = definitionOf("save_onboarding_identity");

  it("carries the path-switching comment only 20260824000003 has", () => {
    expect(definition).toContain("switching paths cannot");
  });

  it("clears the other branch's fields on each path", () => {
    // The correction 20260824000003 made. Without it, switching from student
    // to non-student leaves a university on a profile that has no field of
    // study, which reads as a broken record rather than a changed one.
    expect(definition).toMatch(/profile_type = 'student'[\s\S]*?professional_title = NULL/);
    expect(definition).toMatch(/profile_type = v_profile_type[\s\S]*?university = NULL/);
  });

  it("keeps every work category the application can send", () => {
    for (const category of [
      "research_education",
      "business_technology",
      "policy_community",
      "media_creative",
      "independent",
    ]) {
      expect(definition).toContain(category);
    }
  });
});

describe("complete_onboarding: the locks are the point", () => {
  const definition = definitionOf("complete_onboarding");

  it("takes both FOR UPDATE locks", () => {
    // Two concurrent completions would otherwise write two
    // 'onboarding_completed' activation events for one member, corrupting the
    // measurement this function exists to produce.
    expect(definition.match(/FOR UPDATE/g) ?? []).toHaveLength(2);
  });

  it("is idempotent for a member who already completed", () => {
    expect(definition).toMatch(
      /IF COALESCE\(v_onboarding_completed, false\) THEN\s*RETURN/
    );
  });

  it("still validates the interest count and its uniqueness", () => {
    expect(definition).toContain("NOT BETWEEN 3 AND 5");
    expect(definition).toContain("count(DISTINCT interest)");
  });

  it("writes the activation event with the same source and version", () => {
    expect(definition).toContain("'complete_onboarding_rpc'");
    expect(definition).toContain("'measurement_version', 2");
  });
});

describe("withdraw_post_submission: its WHERE clause is the authorization", () => {
  const definition = definitionOf("withdraw_post_submission");

  it("keeps every conjunct of the gate", () => {
    // guard_locked_post_write() bypasses inside a SECURITY DEFINER function,
    // deliberately, so this clause is the only thing standing between a caller
    // and withdrawing somebody else's submission, or a published one.
    expect(definition).toContain("AND author_id = v_user_id");
    expect(definition).toContain("AND type IN ('research', 'policy_brief')");
    expect(definition).toContain("AND status IN ('pending', 'pending_revision')");
  });

  it("treats an unaffected row as a failure rather than as success", () => {
    // The failure mode this whole migration exists to remove: a WHERE clause
    // that matches nothing and reports success.
    expect(definition).toMatch(
      /IF updated_post\.id IS NULL THEN\s*RAISE EXCEPTION/
    );
  });

  it("retires the reviews in the same transaction", () => {
    expect(definition).toContain("UPDATE public.post_reviews");
    expect(definition).toContain("SET removed_at = now()");
  });

  it("is the body from 20260720000001, not the later stale one", () => {
    // 20260722000001 routes the classification through
    // effective_content_kind(). The live definition does not, and the live
    // definition is what production runs.
    expect(definition).not.toContain("effective_content_kind");
  });
});
