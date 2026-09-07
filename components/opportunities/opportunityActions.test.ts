import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The opportunity writes that used to send `user_id` from the browser.
 *
 * All three took the id from a prop and let RLS decide whether it was allowed.
 * What is checked here is that the row is now keyed on the session, that a
 * signed-out caller writes nothing, and that the two URL fields cannot be used
 * to put a `javascript:` link in front of a partner or an admin.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const viewer = { current: null as { id: string } | null };
vi.mock("@/lib/serverAuth", () => ({ getCurrentUser: async () => viewer.current }));

const state = {
  fellowships: ["fellowship-1"],
  writes: [] as Array<{ table: string; op: string; row: Record<string, unknown>; filters: Record<string, unknown> }>,
};

const FELLOWSHIP = "33333333-3333-4333-8333-333333333333";
const MISSING = "44444444-4444-4444-8444-444444444444";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        maybeSingle: async () => ({
          data: state.fellowships.includes(String(filters.id))
            ? { id: filters.id }
            : null,
          error: null,
        }),
        upsert(row: Record<string, unknown>) {
          state.writes.push({ table, op: "upsert", row, filters });
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            eq(column: string, value: unknown) {
              filters[column] = value;
              return this;
            },
            then(
              onFulfilled: (value: { error: unknown }) => unknown,
              onRejected?: (reason: unknown) => unknown
            ) {
              state.writes.push({ table, op: "delete", row: {}, filters });
              return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
            },
          };
        },
      };
      return builder as never;
    },
  }),
}));

const { toggleSavedOpportunity, saveTalentProfile } = await import(
  "@/components/opportunities/opportunityActions"
);

beforeEach(() => {
  viewer.current = { id: "member-a" };
  state.fellowships = [FELLOWSHIP];
  state.writes = [];
});

describe("toggleSavedOpportunity", () => {
  it("keys the saved row on the session, not on anything the caller sent", async () => {
    const result = await toggleSavedOpportunity({
      fellowshipId: FELLOWSHIP,
      save: true,
    });

    expect(result).toEqual({ ok: true, data: { saved: true } });
    expect(state.writes[0].row).toEqual({
      user_id: "member-a",
      fellowship_id: FELLOWSHIP,
    });
  });

  it("deletes only the viewer's own row", async () => {
    await toggleSavedOpportunity({ fellowshipId: FELLOWSHIP, save: false });

    expect(state.writes[0].op).toBe("delete");
    expect(state.writes[0].filters).toEqual({
      user_id: "member-a",
      fellowship_id: FELLOWSHIP,
    });
  });

  it("refuses a signed-out caller before touching the database", async () => {
    viewer.current = null;

    const result = await toggleSavedOpportunity({
      fellowshipId: FELLOWSHIP,
      save: true,
    });

    expect(result).toEqual({ ok: false, error: "You must be signed in to do that." });
    expect(state.writes).toEqual([]);
  });

  it("rejects an id that is not a uuid rather than sending it on", async () => {
    const result = await toggleSavedOpportunity({
      fellowshipId: "'; drop table saved_opportunities; --",
      save: true,
    });

    expect(result.ok).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it("checks the opportunity exists before writing a row that references it", async () => {
    const result = await toggleSavedOpportunity({ fellowshipId: MISSING, save: true });

    expect(result.ok).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it("treats unsaving something that was never saved as done", async () => {
    const result = await toggleSavedOpportunity({ fellowshipId: MISSING, save: false });
    expect(result).toEqual({ ok: true, data: { saved: false } });
  });
});

describe("saveTalentProfile", () => {
  const profile = {
    openToOpportunities: true,
    opportunityTypes: ["research"],
    cvUrl: "https://example.org/cv.pdf",
    linkedinUrl: "",
    skills: ["Econometrics"],
    visibility: "public",
  };

  it("keys the row on the session", async () => {
    await saveTalentProfile(profile);
    expect(state.writes[0].row.user_id).toBe("member-a");
  });

  it("refuses a signed-out caller", async () => {
    viewer.current = null;
    const result = await saveTalentProfile(profile);
    expect(result.ok).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it("drops an opportunity type the column's CHECK would reject", async () => {
    await saveTalentProfile({ ...profile, opportunityTypes: ["research", "admin"] });
    expect(state.writes[0].row.opportunity_types).toEqual(["research"]);
  });

  it("falls back to the safest visibility for an unknown value", async () => {
    await saveTalentProfile({ ...profile, visibility: "everyone" });
    expect(state.writes[0].row.visibility).toBe("public");
  });

  it("refuses a link scheme a reader must not be handed", async () => {
    // This row is rendered to partners and to admins, so an unchecked value
    // here is a link those readers are invited to click.
    for (const cvUrl of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "not a url at all",
    ]) {
      const result = await saveTalentProfile({ ...profile, cvUrl });
      expect(result.ok, cvUrl).toBe(false);
    }
    expect(state.writes).toEqual([]);
  });

  it("stores an empty link as null rather than as an empty string", async () => {
    await saveTalentProfile({ ...profile, cvUrl: "   " });
    expect(state.writes[0].row.cv_url).toBeNull();
  });

  it("bounds the skills list", async () => {
    await saveTalentProfile({
      ...profile,
      skills: Array.from({ length: 100 }, (_unused, index) => `skill-${index}`),
    });
    expect((state.writes[0].row.skills as string[]).length).toBe(30);
  });
});
