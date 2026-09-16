import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  SELF_EDITABLE_PROFILE_COLUMNS,
  NEVER_SELF_EDITABLE_PROFILE_COLUMNS,
  partitionProfilePatch,
  profileUpdateMessage,
  updateOwnProfile,
} = await import("@/lib/profileMutations");

/**
 * The profile write boundary, and the privilege escalation it exists to stop.
 *
 * Nine client components used to write `public.profiles` directly. What made
 * that safe was not the components: it was a column-level `GRANT UPDATE`
 * naming twenty columns and `protect_profile_privileged_columns()`, a
 * default-deny trigger. Neither survives a direct PostgreSQL connection the
 * application authenticates to itself, so the same default-deny list moved
 * into application code and is asserted here.
 */

const guardMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260826000001_profile_positioning_statement.sql"
  ),
  "utf8"
);

function fakeSupabase(
  options: { rows?: unknown[]; error?: unknown } = {}
) {
  const calls: Array<{ patch: Record<string, unknown>; filters: Record<string, unknown> }> =
    [];

  const client = {
    from(table: string) {
      expect(table).toBe("profiles");
      let patch: Record<string, unknown> = {};
      const filters: Record<string, unknown> = {};

      const builder = {
        update(value: Record<string, unknown>) {
          patch = value;
          return builder;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        select() {
          return builder;
        },
        then(
          onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) {
          calls.push({ patch, filters });
          return Promise.resolve({
            data: options.error ? null : options.rows ?? [{ id: "viewer-1" }],
            error: options.error ?? null,
          }).then(onFulfilled, onRejected);
        },
      };

      return builder as never;
    },
  };

  return { calls, client };
}

describe("the self-editable column allowlist", () => {
  it("matches the database's own default-deny list exactly", () => {
    // If these two disagree, the application and the database disagree about
    // what a member may edit, and the database is right. Parsed from the
    // migration rather than retyped, so a future column added to one side is
    // a failing test rather than a divergence nobody notices.
    const declared = guardMigration.match(
      /v_directly_editable_columns CONSTANT text\[\] := ARRAY\[([\s\S]*?)\]::text\[\]/
    );
    expect(declared).not.toBeNull();

    const fromSql = (declared?.[1] ?? "")
      .split(",")
      .map((entry) => entry.trim().replace(/^'|'$/g, ""))
      .filter(Boolean);

    expect([...SELF_EDITABLE_PROFILE_COLUMNS].sort()).toEqual([...fromSql].sort());
  });

  it("contains nothing that grants capability or attests identity", () => {
    for (const column of NEVER_SELF_EDITABLE_PROFILE_COLUMNS) {
      expect(SELF_EDITABLE_PROFILE_COLUMNS).not.toContain(column);
    }
  });
});

describe("partitionProfilePatch", () => {
  it("keeps the columns a member owns", () => {
    const { allowed, rejected } = partitionProfilePatch({
      full_name: "Ada",
      bio: "Writes about power grids",
    });
    expect(allowed).toEqual({ full_name: "Ada", bio: "Writes about power grids" });
    expect(rejected).toEqual([]);
  });

  it("rejects a role escalation rather than dropping it silently", () => {
    // A silent drop is how an attempt looks identical to a success, and how a
    // caller comes to believe it saved something it did not.
    const { allowed, rejected } = partitionProfilePatch({
      full_name: "Ada",
      role: "admin",
    });
    expect(allowed).toEqual({ full_name: "Ada" });
    expect(rejected).toEqual(["role"]);
  });

  it("rejects every privileged column, one at a time", () => {
    for (const column of NEVER_SELF_EDITABLE_PROFILE_COLUMNS) {
      const { allowed, rejected } = partitionProfilePatch({ [column]: "anything" });
      expect(allowed, `${column} must not be writable`).toEqual({});
      expect(rejected).toEqual([column]);
    }
  });

  it("ignores an absent field rather than writing undefined over a value", () => {
    const { allowed, rejected } = partitionProfilePatch({
      full_name: "Ada",
      bio: undefined,
    });
    expect(allowed).toEqual({ full_name: "Ada" });
    expect(rejected).toEqual([]);
  });

  it("keeps a null, which is how a member clears a field", () => {
    const { allowed } = partitionProfilePatch({ cover_image_url: null });
    expect(allowed).toEqual({ cover_image_url: null });
  });
});

describe("updateOwnProfile", () => {
  it("writes only the viewer's own row", async () => {
    const { calls, client } = fakeSupabase();
    await updateOwnProfile(client, {
      viewerId: "viewer-1",
      patch: { full_name: "Ada" },
    });

    expect(calls).toEqual([
      { patch: { full_name: "Ada" }, filters: { id: "viewer-1" } },
    ]);
  });

  it("refuses a patch containing a privileged column, without writing anything", async () => {
    const { calls, client } = fakeSupabase();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await updateOwnProfile(client, {
      viewerId: "viewer-1",
      patch: { full_name: "Ada", role: "admin", verified: true },
    });

    expect(result).toEqual({
      ok: false,
      failure: { reason: "forbidden_columns", rejected: ["role", "verified"] },
    });
    // Not "wrote the safe half". The whole patch is refused.
    expect(calls).toEqual([]);
    error.mockRestore();
  });

  it("reports a missing row rather than an empty success", async () => {
    // A PostgREST update that matches nothing reports success with an empty
    // body, so without the .select() this would be indistinguishable from a
    // write that worked.
    const { client } = fakeSupabase({ rows: [] });
    const result = await updateOwnProfile(client, {
      viewerId: "viewer-1",
      patch: { full_name: "Ada" },
    });
    expect(result).toEqual({ ok: false, failure: { reason: "not_found" } });
  });

  it("names a taken username instead of surfacing the constraint", async () => {
    const { client } = fakeSupabase({ error: { code: "23505", message: "duplicate key" } });
    const result = await updateOwnProfile(client, {
      viewerId: "viewer-1",
      patch: { username: "ada" },
    });
    expect(result).toEqual({ ok: false, failure: { reason: "username_taken" } });
    expect(profileUpdateMessage({ reason: "username_taken" })).toBe(
      "That username is already taken."
    );
  });

  it("refuses an empty patch rather than issuing a no-op update", async () => {
    const { calls, client } = fakeSupabase();
    const result = await updateOwnProfile(client, { viewerId: "viewer-1", patch: {} });
    expect(result).toEqual({ ok: false, failure: { reason: "empty_patch" } });
    expect(calls).toEqual([]);
  });

  it("never puts a database message in front of a member", () => {
    // A raw PostgREST message names columns, constraints and policies. Every
    // failure has to map to a sentence instead.
    const failures = [
      { reason: "username_taken" },
      { reason: "empty_patch" },
      { reason: "forbidden_columns", rejected: ["role"] },
      { reason: "not_found" },
      { reason: "query_failed" },
    ] as const;

    for (const failure of failures) {
      const message = profileUpdateMessage(failure);
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/policy|constraint|violates|column|relation/i);
    }
  });
});

describe("the profile server actions", () => {
  const actions = readFileSync(
    resolve(process.cwd(), "app/(main)/settings/profileActions.ts"),
    "utf8"
  );

  it("take no profile id from the caller", () => {
    // The nine client components each passed one. An argument is something a
    // browser can choose, which is exactly what must not decide whose row is
    // written. Checked against the exported signatures rather than the whole
    // file: an internal helper taking an already-resolved viewer id is fine,
    // and is not something a caller can reach.
    const signatures = [
      ...actions.matchAll(/export async function [\s\S]*?\): Promise/g),
    ].map((match) => match[0]);

    expect(signatures.length).toBeGreaterThan(5);
    for (const signature of signatures) {
      expect(signature).not.toMatch(/\b(profileId|userId|ownerId|authorId)\b/);
    }

    // Also the declared input interfaces, which sit outside the signature.
    for (const block of [
      ...actions.matchAll(/export interface \w+Input \{[\s\S]*?\n\}/g),
    ].map((match) => match[0])) {
      expect(block).not.toMatch(/\b(profileId|userId|ownerId|authorId)\b/);
    }

    expect(actions).toContain("requireViewer()");
  });

  it("write through the allowlist rather than around it", () => {
    // Every action reaches the table through updateOwnProfile. A direct
    // `.from("profiles").update(` here would bypass the column allowlist.
    expect(actions).not.toMatch(/\.from\("profiles"\)[\s\S]{0,120}?\.update\(/);
  });
});
