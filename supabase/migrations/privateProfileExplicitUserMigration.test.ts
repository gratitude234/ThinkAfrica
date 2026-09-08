import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The contracts 20260910000001_private_profile_explicit_user.sql has to satisfy.
 *
 * This one carries more than the other six put together. Its projection is a
 * member's signup address, their notification preferences, their privacy
 * settings and their suspension state, and it is reachable from the home feed,
 * settings, subscriptions, onboarding and the notification bell.
 *
 * Four properties, each of which would fail silently:
 *
 *   1. A browser must not be able to ask for someone else's private profile.
 *      That is why the explicit-id form is in `private` rather than being a
 *      public overload with a runtime guard.
 *   2. The projection must not change. A parity check compares the two paths
 *      column by column, and a column added or reordered here would read as a
 *      difference in the data rather than a change in the contract.
 *   3. An anonymous caller must keep getting no row, not an error. The current
 *      function returns nothing without auth.uid(), and the settings page
 *      relies on that.
 *   4. A NULL actor must never widen visibility. `p.id = NULL` matches nothing,
 *      which is correct; `WHERE NULL IS NULL` would match everything, which is
 *      the shape of the bug this whole migration exists to prevent.
 */

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260910000001_private_profile_explicit_user.sql"
  ),
  "utf8"
);

/** Executable SQL only: the header discusses the design it replaced, and prose
 *  describing a pattern must not satisfy a check for that pattern. */
const executable = migration
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

/** The twelve columns the live function returns, in order. Taken from the
 *  production catalogue, not from this file. */
const PROJECTION = [
  "profile_id",
  "signup_email",
  "notification_prefs",
  "privacy_settings",
  "onboarding_completed",
  "suspended_at",
  "suspended_reason",
  "last_engagement_push_notified_at",
  "last_comment_email_notified_at",
  "push_prompt_shown_at",
  "push_prompt_last_shown_at",
  "push_prompt_attempt_count",
] as const;

describe("the migration's shape", () => {
  it("is one transaction with a lock timeout", () => {
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
    expect(migration).toContain("SET LOCAL lock_timeout");
  });

  it("drops nothing", () => {
    expect(executable).not.toMatch(/\bDROP\s+FUNCTION\b/i);
    expect(executable).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(executable).not.toMatch(/\bALTER\s+TABLE\b/i);
  });

  it("documents how to roll back, including the original body", () => {
    expect(migration).toMatch(/ROLLBACK/);
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS private.get_my_profile_private_impl(uuid)"
    );
    // The wrapper is a CREATE OR REPLACE of an existing signature, so rolling
    // back means restoring a body rather than dropping something.
    expect(migration).toContain("WHERE auth.uid() IS NOT NULL AND p.id = auth.uid()");
  });
});

describe("the security model", () => {
  it("puts the explicit-id implementation in private, never in public", () => {
    expect(executable).toContain(
      "FUNCTION private.get_my_profile_private_impl(p_user_id uuid)"
    );
    expect(executable).not.toMatch(
      /FUNCTION public\.get_my_profile_private\(\s*\n?\s*p_user_id/
    );
  });

  it("grants the implementation to nobody", () => {
    // The wrapper reaches it as its owner. A GRANT here would let any
    // authenticated caller name another member's id.
    expect(executable).not.toMatch(
      /GRANT EXECUTE ON FUNCTION private\.get_my_profile_private_impl/
    );
    expect(executable).toContain(
      "REVOKE ALL ON FUNCTION private.get_my_profile_private_impl(uuid)"
    );
    expect(executable).toMatch(
      /REVOKE ALL ON FUNCTION private\.get_my_profile_private_impl\(uuid\)\s*\n?\s*FROM public, anon, authenticated;/
    );
  });

  it("keeps the public wrapper at the posture the original had", () => {
    expect(executable).toContain(
      "REVOKE ALL ON FUNCTION public.get_my_profile_private() FROM public, anon;"
    );
    expect(executable).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_my_profile_private\(\)\s*\n?\s*TO authenticated, service_role;/
    );
  });

  it("makes both functions SECURITY DEFINER with an empty search_path", () => {
    const definitions = executable.match(/CREATE OR REPLACE FUNCTION/g) ?? [];
    expect(definitions).toHaveLength(2);

    const definer = executable.match(/SECURITY DEFINER/g) ?? [];
    expect(definer).toHaveLength(2);

    const pinned = executable.match(/SET search_path = ''/g) ?? [];
    expect(pinned).toHaveLength(2);
    expect(executable).not.toMatch(/SET search_path = public\b/);
  });

  it("takes no user id on the public signature, so there is nothing to forge", () => {
    expect(executable).toContain("FUNCTION public.get_my_profile_private()");
  });
});

describe("the projection", () => {
  const impl = migration.slice(
    migration.indexOf("FUNCTION private.get_my_profile_private_impl"),
    migration.indexOf("COMMENT ON FUNCTION private.get_my_profile_private_impl")
  );

  it("returns the same twelve columns, in the same order", () => {
    // A parity check compares the two paths column by column. A column added
    // or reordered here would read as a difference in the data.
    const returns = impl.slice(impl.indexOf("RETURNS TABLE"), impl.indexOf("LANGUAGE"));
    const found = PROJECTION.filter((column) => returns.includes(column));
    expect(found).toEqual([...PROJECTION]);

    for (let index = 1; index < PROJECTION.length; index += 1) {
      expect(
        returns.indexOf(PROJECTION[index]),
        `${PROJECTION[index]} must follow ${PROJECTION[index - 1]}`
      ).toBeGreaterThan(returns.indexOf(PROJECTION[index - 1]));
    }
  });

  it("selects from profiles and filters on the actor's own id", () => {
    expect(impl).toContain("FROM public.profiles AS p");
    expect(impl).toContain("WHERE p.id = private.assert_identity_claim(p_user_id)");
  });

  it("never widens on a null actor", () => {
    // The failure this guards against is a predicate that becomes true rather
    // than false when the id is missing. assert_identity_claim raises on NULL,
    // and even without it `p.id = NULL` matches nothing.
    expect(impl).not.toMatch(/IS NOT DISTINCT FROM/i);
    expect(impl).not.toMatch(/OR\s+p_user_id IS NULL/i);
    expect(impl).toContain("assert_identity_claim");
  });
});

describe("the public wrapper", () => {
  const wrapper = migration.slice(
    migration.indexOf("FUNCTION public.get_my_profile_private()"),
    migration.indexOf("COMMENT ON FUNCTION public.get_my_profile_private()")
  );

  it("delegates rather than repeating the projection", () => {
    expect(wrapper).toContain(
      "FROM private.get_my_profile_private_impl((SELECT auth.uid()))"
    );
  });

  it("returns no row for an anonymous caller rather than raising", () => {
    // The implementation raises on a NULL id, which is right for a trusted
    // server and wrong for a signed-out visitor. The guard stays in the
    // wrapper so today's behaviour is unchanged.
    expect(wrapper).toMatch(/WHERE \(SELECT auth\.uid\(\)\) IS NOT NULL/);
  });
});

describe("the application", () => {
  it("does not call the implementation through PostgREST", () => {
    // There is no request that could: `private` is not an exposed schema. This
    // asserts the intent as well, so a future caller cannot quietly try.
    const callers = [
      "components/ui/NotificationBell.tsx",
      "app/(main)/settings/page.tsx",
      "app/(main)/subscriptions/page.tsx",
      "app/api/notifications/route.ts",
    ];
    for (const caller of callers) {
      const source = readFileSync(resolve(process.cwd(), caller), "utf8");
      expect(
        source,
        `${caller} must not name the private implementation`
      ).not.toContain("get_my_profile_private_impl");
    }
  });
});
