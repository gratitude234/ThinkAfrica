import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The PostgREST profile read, held to the two things the profile page depends
 * on and one thing the deployment depends on.
 *
 * The null-versus-error distinction used to live in lib/profileViewData.ts and
 * is tested here now, because this is where the query is. A null row with no
 * error is an answer: no such username. A null row with an error is a failure
 * wearing the same clothes, and reading the second as the first is what told
 * every visitor that every member's profile did not exist while Supabase was
 * unresponsive.
 *
 * The third is the positioning gate. PostgREST rejects an entire select over
 * one unknown column name, so naming a column whose migration has not been
 * applied does not degrade the profile, it removes it.
 */

vi.mock("server-only", () => ({}));

const positioningEnabled = vi.hoisted(() => vi.fn(() => false));
vi.mock("@/lib/featureFlags", async () => {
  const actual = await vi.importActual<typeof import("@/lib/featureFlags")>(
    "@/lib/featureFlags"
  );
  return { ...actual, isProfilePositioningEnabled: positioningEnabled };
});

interface QueryLogEntry {
  table: string;
  select: string;
  filters: Array<[string, unknown]>;
  terminal: string | null;
}

const queryLog: QueryLogEntry[] = [];
let answer: { data: unknown; error: { message: string } | null } = {
  data: null,
  error: null,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      const entry: QueryLogEntry = {
        table,
        select: "",
        filters: [],
        terminal: null,
      };
      queryLog.push(entry);
      const chain = {
        select(columns: string) {
          entry.select = columns;
          return chain;
        },
        eq(column: string, value: unknown) {
          entry.filters.push([column, value]);
          return chain;
        },
        maybeSingle() {
          entry.terminal = "maybeSingle";
          return Promise.resolve(answer);
        },
      };
      return chain;
    },
  }),
}));

const { supabaseProfilesRepository, profileIdentitySelect } = await import(
  "@/lib/db/supabase/profiles"
);

const PROFILE_ROW = {
  id: "author-1",
  username: "student1",
  full_name: "A Student",
  country: "Nigeria",
  university: "University of Lagos",
  field_of_study: "Political Science",
  graduation_year: 2028,
  is_alumni: false,
  bio: null,
  avatar_url: null,
  cover_image_url: null,
  verified: false,
  verified_type: null,
  interests: null,
  profile_type: "student",
  professional_title: null,
  organization_name: null,
  organization_website: null,
};

beforeEach(() => {
  queryLog.length = 0;
  answer = { data: null, error: null };
  positioningEnabled.mockReturnValue(false);
});

describe("profileIdentitySelect", () => {
  it("leaves the positioning column out until its migration is applied", () => {
    expect(profileIdentitySelect()).not.toContain("positioning_statement");
  });

  it("names it once the flag says the column exists", () => {
    positioningEnabled.mockReturnValue(true);
    expect(profileIdentitySelect()).toContain("positioning_statement");
  });

  it("asks for no column the profile page does not render", () => {
    // A select is a projection, and a widened one is how a private column
    // reaches a public page without anybody deciding that it should.
    const columns = profileIdentitySelect()
      .split(",")
      .map((column) => column.trim());
    expect(columns).not.toContain("signup_email");
    expect(columns).not.toContain("email");
    expect(columns).not.toContain("role");
  });
});

describe("supabaseProfilesRepository.findIdentityByUsername", () => {
  it("reads the profiles table filtered by username, at most one row", async () => {
    answer = { data: PROFILE_ROW, error: null };

    const profile = await supabaseProfilesRepository.findIdentityByUsername(
      "student1"
    );

    expect(profile).toEqual(PROFILE_ROW);
    expect(queryLog).toHaveLength(1);
    expect(queryLog[0].table).toBe("profiles");
    expect(queryLog[0].filters).toEqual([["username", "student1"]]);
    // Not `.single()`, which turns an absent profile into an error, and not
    // `.limit(1)`, which would quietly serve one of two rows if the unique
    // constraint on username were ever lost.
    expect(queryLog[0].terminal).toBe("maybeSingle");
  });

  it("returns null when the query succeeded and matched nothing", async () => {
    answer = { data: null, error: null };

    await expect(
      supabaseProfilesRepository.findIdentityByUsername("nobody")
    ).resolves.toBeNull();
  });

  it("throws when the query itself failed", async () => {
    answer = { data: null, error: { message: "connection timed out" } };

    await expect(
      supabaseProfilesRepository.findIdentityByUsername("student1")
    ).rejects.toThrow(/Failed to load profile/);
  });

  it("does not put the database message into the thrown surface text", async () => {
    answer = {
      data: null,
      error: { message: 'relation "profiles" does not exist' },
    };

    // The message is for the server log. What the reader sees is the route's
    // error boundary, which never prints this.
    await expect(
      supabaseProfilesRepository.findIdentityByUsername("student1")
    ).rejects.toThrow(/^Failed to load profile "student1"\.$/);
  });
});
