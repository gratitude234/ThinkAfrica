import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The PostgREST profile read, held to the two things the profile page depends
 * on and one thing the projection depends on.
 *
 * A null row with no error is an answer: no such username. A null row with an
 * error is a failure wearing the same clothes, and reading the second as the
 * first is what once told every visitor that every member's profile did not
 * exist while Supabase was unresponsive.
 *
 * The third is the projection itself. A select is a public surface, and a
 * widened one is how a private or retired column reaches a page without
 * anybody deciding that it should.
 */

vi.mock("server-only", () => ({}));

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

const { supabaseProfilesRepository, PROFILE_IDENTITY_SELECT } = await import(
  "@/lib/db/supabase/profiles"
);

const PROFILE_ROW = {
  id: "author-1",
  username: "student1",
  full_name: "A Student",
  bio: null,
  avatar_url: null,
  professional_title: "Policy researcher",
  country: "Nigeria",
  university: "University of Lagos",
  field_of_study: "Political Science",
  graduation_year: 2028,
  interests: null,
  verified: false,
  verified_type: null,
  created_at: "2026-01-05T09:30:00+00:00",
};

beforeEach(() => {
  queryLog.length = 0;
  answer = { data: null, error: null };
});

describe("PROFILE_IDENTITY_SELECT", () => {
  const columns = PROFILE_IDENTITY_SELECT.split(",").map((column) => column.trim());

  it("asks for exactly what a writer's profile renders", () => {
    expect(columns).toEqual(Object.keys(PROFILE_ROW));
  });

  it("names no private column and no retired one", () => {
    for (const column of [
      "signup_email",
      "email",
      "role",
      "privacy_settings",
      "positioning_statement",
      "profile_type",
      "secondary_profile_types",
      "organization_name",
      "organization_website",
      "cover_image_url",
      "is_alumni",
      "open_to_mentoring",
    ]) {
      expect(columns).not.toContain(column);
    }
  });
});

describe("supabaseProfilesRepository.findIdentityByUsername", () => {
  it("reads the profiles table filtered by username, at most one row", async () => {
    answer = { data: PROFILE_ROW, error: null };

    const profile = await supabaseProfilesRepository.findIdentityByUsername(
      "student1",
      null
    );

    expect(profile).toEqual(PROFILE_ROW);
    expect(queryLog).toHaveLength(1);
    expect(queryLog[0].table).toBe("profiles");
    expect(queryLog[0].select).toBe(PROFILE_IDENTITY_SELECT);
    expect(queryLog[0].filters).toEqual([["username", "student1"]]);
    // Not `.single()`, which turns an absent profile into an error, and not
    // `.limit(1)`, which would quietly serve one of two rows if the unique
    // constraint on username were ever lost.
    expect(queryLog[0].terminal).toBe("maybeSingle");
  });

  it("returns null when the query succeeded and matched nothing", async () => {
    answer = { data: null, error: null };

    await expect(
      supabaseProfilesRepository.findIdentityByUsername("nobody", null)
    ).resolves.toBeNull();
  });

  it("throws when the query itself failed", async () => {
    answer = { data: null, error: { message: "connection timed out" } };

    await expect(
      supabaseProfilesRepository.findIdentityByUsername("student1", null)
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
      supabaseProfilesRepository.findIdentityByUsername("student1", null)
    ).rejects.toThrow(/^Failed to load profile "student1"\.$/);
  });
});
