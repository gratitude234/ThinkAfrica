import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const recordActivationEvent = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/activationServer", () => ({ recordActivationEvent }));

type Result = { data: unknown; error: { message: string } | null };

/**
 * A service-role client shaped like the query builder: reads resolve through
 * `maybeSingle` from a queue, the update resolves when awaited, and every
 * chain call is logged so a test can assert exactly what was written and to
 * which row.
 */
const admin = vi.hoisted(() => ({
  throwOnCreate: false,
  reads: [] as Result[],
  update: { data: [{ id: "user-1" }], error: null } as Result,
  log: [] as Array<{ table: string; ops: unknown[][] }>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (admin.throwOnCreate) throw new Error("service role key is not configured");
    return {
      from(table: string) {
        const entry = { table, ops: [] as unknown[][] };
        admin.log.push(entry);
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "eq", "not", "update"]) {
          chain[method] = (...args: unknown[]) => {
            entry.ops.push([method, ...args]);
            return chain;
          };
        }
        chain.maybeSingle = () =>
          Promise.resolve(admin.reads.shift() ?? { data: null, error: null });
        chain.then = (onOk: (value: Result) => unknown, onErr: (error: unknown) => unknown) =>
          Promise.resolve(admin.update).then(onOk, onErr);
        return chain;
      },
    };
  },
}));

const { completeOwnOnboarding } = await import("./onboardingCompletion");

const pending = { full_name: "Ada Obi", username: "ada", onboarding_completed: false };

function updateOps() {
  return admin.log.flatMap((entry) => entry.ops).filter(([method]) => method === "update");
}

beforeEach(() => {
  admin.throwOnCreate = false;
  admin.reads = [];
  admin.update = { data: [{ id: "user-1" }], error: null };
  admin.log = [];
  recordActivationEvent.mockClear();
});

describe("completeOwnOnboarding", () => {
  it("completes a member whose stored name and username stand, and nothing more is asked", async () => {
    // No country, school, persona, path or topics on the row.
    admin.reads = [{ data: pending, error: null }];

    await expect(completeOwnOnboarding("user-1")).resolves.toEqual({
      ok: true,
      alreadyCompleted: false,
    });

    const write = admin.log[1];
    expect(write.table).toBe("profiles");
    expect(write.ops).toContainEqual(["eq", "id", "user-1"]);
    expect(write.ops).toContainEqual(["not", "onboarding_completed", "is", true]);
    // A write whose affected rows are read back, so matching nothing is visible.
    expect(write.ops).toContainEqual(["select", "id"]);
  });

  it("writes the completion flag and its timestamp, and no other column", async () => {
    admin.reads = [{ data: pending, error: null }];
    await completeOwnOnboarding("user-1");

    const [[, patch]] = updateOps() as Array<[string, Record<string, unknown>]>;
    expect(Object.keys(patch).sort()).toEqual(["onboarding_completed", "onboarding_completed_at"]);
    expect(patch.onboarding_completed).toBe(true);
    expect(Number.isNaN(Date.parse(String(patch.onboarding_completed_at)))).toBe(false);
  });

  it("records onboarding_completed once, on the server", async () => {
    admin.reads = [{ data: pending, error: null }];
    await completeOwnOnboarding("user-1");

    expect(recordActivationEvent).toHaveBeenCalledTimes(1);
    expect(recordActivationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "onboarding_completed",
        userId: "user-1",
        source: "complete_onboarding_action",
        route: "/onboarding",
      })
    );
  });

  it("refuses a member without a name or a usable username, writing nothing", async () => {
    for (const row of [
      { ...pending, full_name: "  " },
      { ...pending, username: null },
      { ...pending, username: "settings" },
    ]) {
      admin.log = [];
      admin.reads = [{ data: row, error: null }];
      await expect(completeOwnOnboarding("user-1")).resolves.toEqual({
        ok: false,
        reason: "incomplete_profile",
      });
      expect(updateOps()).toEqual([]);
    }
    expect(recordActivationEvent).not.toHaveBeenCalled();
  });

  it("leaves a member who already finished alone", async () => {
    admin.reads = [{ data: { ...pending, onboarding_completed: true }, error: null }];

    await expect(completeOwnOnboarding("user-1")).resolves.toEqual({
      ok: true,
      alreadyCompleted: true,
    });
    expect(updateOps()).toEqual([]);
    expect(recordActivationEvent).not.toHaveBeenCalled();
  });

  it("treats losing a race to a second request as success", async () => {
    admin.update = { data: [], error: null };
    admin.reads = [
      { data: pending, error: null },
      { data: { onboarding_completed: true }, error: null },
    ];

    await expect(completeOwnOnboarding("user-1")).resolves.toEqual({
      ok: true,
      alreadyCompleted: true,
    });
    expect(recordActivationEvent).not.toHaveBeenCalled();
  });

  it("does not report success for a write that matched nothing for another reason", async () => {
    admin.update = { data: [], error: null };
    admin.reads = [
      { data: pending, error: null },
      { data: { onboarding_completed: false }, error: null },
    ];

    await expect(completeOwnOnboarding("user-1")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("says unavailable, never incomplete, when the database cannot answer", async () => {
    admin.reads = [{ data: null, error: { message: "statement timeout" } }];
    await expect(completeOwnOnboarding("user-1")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });

    admin.reads = [{ data: pending, error: null }];
    admin.update = { data: null, error: { message: "statement timeout" } };
    await expect(completeOwnOnboarding("user-1")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });

    admin.throwOnCreate = true;
    await expect(completeOwnOnboarding("user-1")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("reports a missing row as not found", async () => {
    admin.reads = [{ data: null, error: null }];
    await expect(completeOwnOnboarding("user-1")).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("is reached only from the onboarding server action, which resolves the viewer itself", () => {
    const actions = readFileSync(
      resolve(process.cwd(), "app/(onboarding)/onboarding/actions.ts"),
      "utf8"
    );
    expect(actions).toContain("const viewer = await requireViewer();");
    expect(actions).toContain("completeOwnOnboarding(viewer.userId)");
    expect(actions).toMatch(/export async function completeOnboarding\(\)/);
  });
});
