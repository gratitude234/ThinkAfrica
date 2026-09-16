import { describe, expect, it, vi } from "vitest";

import {
  PROFILE_BY_USERNAME_SQL,
  createPostgresProfilesRepository,
  toProfileIdentityRecord,
} from "@/lib/db/postgres/profiles";
import { PROFILE_IDENTITY_SELECT } from "@/lib/db/supabase/profiles";

/**
 * The direct-SQL profile lookup, held to the behaviour of the PostgREST query
 * it has to be swappable with. What is tested is everything that is not the
 * connection: the statement, the parameters, the row the mapper produces, and
 * the failure modes that would otherwise be discovered in production.
 */

vi.mock("server-only", () => ({}));

function fakeExecutor(rows: Record<string, unknown>[]) {
  const calls: Array<{ text: string; params: readonly unknown[] }> = [];
  return {
    calls,
    executor: {
      async query<Row>(text: string, params: readonly unknown[] = []) {
        calls.push({ text, params });
        return rows as unknown as Row[];
      },
    },
  };
}

function failingExecutor(error: Error) {
  return {
    async query<Row>(): Promise<Row[]> {
      throw error;
    },
  };
}

/** What postgres.js hands back with `fetch_types: false`. */
const fullRow = {
  id: "author-1",
  username: "student1",
  full_name: "A Student",
  bio: null,
  avatar_url: null,
  professional_title: "Policy researcher",
  country: "Nigeria",
  university: "University of Lagos",
  field_of_study: "Political Science",
  graduation_year: "2028",
  interests: ["governance", "policy"],
  verified: "t",
  verified_type: "institution",
  created_at: "2026-01-05T09:30:00.123456+00:00",
};

describe("the statement", () => {
  it("parameterises the username", () => {
    expect(PROFILE_BY_USERNAME_SQL).toContain("p.username = $1");
  });

  it("selects interests as jsonb rather than as a bare array", () => {
    // Under fetch_types: false a bare text[] arrives as the string {a,b} and
    // the first .map() in a component throws. See normalise.ts.
    expect(PROFILE_BY_USERNAME_SQL).toContain("to_jsonb(p.interests)");
  });

  it("selects created_at as the JSON text PostgREST serialises", () => {
    expect(PROFILE_BY_USERNAME_SQL).toContain("to_jsonb(p.created_at) #>> '{}' as created_at");
  });

  it("asks for two rows so a lost unique constraint is loud", () => {
    // The PostgREST path uses maybeSingle(), which fails on two rows rather
    // than picking one. limit 1 would silently serve an arbitrary profile.
    expect(PROFILE_BY_USERNAME_SQL).toContain("limit 2");
  });

  it("selects the same columns as the PostgREST projection, and nothing retired", () => {
    const selected = [
      ...PROFILE_BY_USERNAME_SQL.slice(0, PROFILE_BY_USERNAME_SQL.indexOf("from public.profiles")).matchAll(
        /p\.([a-z_]+)\b(?![^,]*\bas\b)|as ([a-z_]+)/g
      ),
    ].map((match) => match[1] ?? match[2]);
    const unique = [...new Set(selected.filter((column) => column !== "interests" && column !== "created_at"))];
    const expected = PROFILE_IDENTITY_SELECT.split(",")
      .map((column) => column.trim())
      .filter((column) => column !== "interests" && column !== "created_at");
    expect(unique).toEqual(expected);

    for (const retired of [
      "positioning_statement",
      "profile_type",
      "organization_name",
      "organization_website",
      "cover_image_url",
      "is_alumni",
      "signup_email",
      "select *",
    ]) {
      expect(PROFILE_BY_USERNAME_SQL).not.toContain(retired);
    }
  });
});

describe("toProfileIdentityRecord", () => {
  it("produces what the PostgREST projection produced", () => {
    expect(toProfileIdentityRecord(fullRow)).toEqual({
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
      interests: ["governance", "policy"],
      verified: true,
      verified_type: "institution",
      created_at: "2026-01-05T09:30:00.123456+00:00",
    });
  });

  it("keeps no interests and never answered apart", () => {
    expect(toProfileIdentityRecord({ ...fullRow, interests: [] }).interests).toEqual([]);
    expect(toProfileIdentityRecord({ ...fullRow, interests: null }).interests).toBeNull();
  });

  it("parses the array literal an untyped driver would hand over", () => {
    expect(
      toProfileIdentityRecord({ ...fullRow, interests: "{governance,policy}" }).interests
    ).toEqual(["governance", "policy"]);
  });

  it("does not let an unreadable verified flag become a badge", () => {
    expect(toProfileIdentityRecord({ ...fullRow, verified: null }).verified).toBe(false);
  });
});

describe("createPostgresProfilesRepository", () => {
  it("sends the username and the viewer, and nothing else", async () => {
    const { calls, executor } = fakeExecutor([fullRow]);

    const profile = await createPostgresProfilesRepository(
      executor
    ).findIdentityByUsername("student1", null);

    expect(profile?.username).toBe("student1");
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toBe(PROFILE_BY_USERNAME_SQL);
    // The viewer is the second parameter, because the profiles policy decides
    // whether this profile is found at all. Null is the logged-out reader.
    expect(calls[0].params).toEqual(["student1", null]);
    expect(
      calls[0].params.every((param) => param === null || typeof param === "string")
    ).toBe(true);
  });

  it("carries the profiles policy, so a private profile is not found", () => {
    // The rule PostgREST applied from the session, inlined. Without it the
    // direct lookup renders a private profile to whoever guessed the username.
    expect(PROFILE_BY_USERNAME_SQL).toMatch(/suspended_at is null/);
    expect(PROFILE_BY_USERNAME_SQL).toMatch(/members_only/);
    expect(PROFILE_BY_USERNAME_SQL).toMatch(/\$2::uuid/);
    expect(PROFILE_BY_USERNAME_SQL).not.toMatch(/auth\.uid\(\)/);
  });

  it("returns null for a username that matched nothing", async () => {
    const { executor } = fakeExecutor([]);

    await expect(
      createPostgresProfilesRepository(executor).findIdentityByUsername("nobody", null)
    ).resolves.toBeNull();
  });

  it("throws when one username matched two rows", async () => {
    const { executor } = fakeExecutor([fullRow, fullRow]);

    await expect(
      createPostgresProfilesRepository(executor).findIdentityByUsername("student1", null)
    ).rejects.toThrow(/Failed to load profile/);
  });

  it("does not put the database message into the thrown surface text", async () => {
    const executor = failingExecutor(new Error('relation "profiles" does not exist'));

    await expect(
      createPostgresProfilesRepository(executor).findIdentityByUsername("student1", null)
    ).rejects.toThrow(/^Failed to load profile "student1"\.$/);
  });
});
