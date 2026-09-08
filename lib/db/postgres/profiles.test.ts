import { describe, expect, it, vi } from "vitest";

import {
  PROFILE_BY_USERNAME_SQL,
  PROFILE_BY_USERNAME_WITH_POSITIONING_SQL,
  createPostgresProfilesRepository,
  profileByUsernameSql,
  toProfileIdentityRecord,
} from "@/lib/db/postgres/profiles";

/**
 * The direct-SQL profile lookup, held to the behaviour of the PostgREST query
 * it has to be swappable with. It cannot be run against a database in this
 * phase, so what is tested is everything that is not the connection: the two
 * statements, the parameters, the row the mapper produces, and the failure
 * modes that would otherwise be discovered in production.
 */

vi.mock("server-only", () => ({}));

const positioningEnabled = vi.hoisted(() => vi.fn(() => false));
vi.mock("@/lib/featureFlags", async () => {
  const actual = await vi.importActual<typeof import("@/lib/featureFlags")>(
    "@/lib/featureFlags"
  );
  return { ...actual, isProfilePositioningEnabled: positioningEnabled };
});

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

const fullRow = {
  id: "author-1",
  username: "student1",
  full_name: "A Student",
  country: "Nigeria",
  university: "University of Lagos",
  field_of_study: "Political Science",
  graduation_year: "2028",
  is_alumni: "f",
  bio: null,
  avatar_url: null,
  cover_image_url: null,
  verified: "t",
  verified_type: "institution",
  interests: ["governance", "policy"],
  profile_type: "student",
  professional_title: null,
  organization_name: null,
  organization_website: null,
};

describe("the statements", () => {
  it("parameterise the username in both forms", () => {
    for (const sql of [
      PROFILE_BY_USERNAME_SQL,
      PROFILE_BY_USERNAME_WITH_POSITIONING_SQL,
    ]) {
      expect(sql).toContain("p.username = $1");
    }
  });

  it("select interests as jsonb rather than as a bare array", () => {
    // Under fetch_types: false a bare text[] arrives as the string {a,b} and
    // the first .map() in a component throws. See normalise.ts.
    expect(PROFILE_BY_USERNAME_SQL).toContain("to_jsonb(p.interests)");
  });

  it("ask for two rows so a lost unique constraint is loud", () => {
    // The PostgREST path uses maybeSingle(), which fails on two rows rather
    // than picking one. limit 1 would silently serve an arbitrary profile.
    expect(PROFILE_BY_USERNAME_SQL).toContain("limit 2");
  });

  it("differ only by the positioning column", () => {
    const withoutColumn = PROFILE_BY_USERNAME_WITH_POSITIONING_SQL.replace(
      /,\s*\n\s*p\.positioning_statement/,
      ""
    );
    expect(withoutColumn.replace(/\s+/g, " ").trim()).toBe(
      PROFILE_BY_USERNAME_SQL.replace(/\s+/g, " ").trim()
    );
  });

  it("name no column the profile page does not render", () => {
    for (const sql of [
      PROFILE_BY_USERNAME_SQL,
      PROFILE_BY_USERNAME_WITH_POSITIONING_SQL,
    ]) {
      expect(sql).not.toContain("signup_email");
      expect(sql).not.toContain("select *");
    }
  });
});

describe("profileByUsernameSql", () => {
  it("leaves the positioning column out until its migration is applied", () => {
    positioningEnabled.mockReturnValue(false);
    expect(profileByUsernameSql()).toBe(PROFILE_BY_USERNAME_SQL);
  });

  it("names it once the flag says the column exists", () => {
    positioningEnabled.mockReturnValue(true);
    expect(profileByUsernameSql()).toBe(
      PROFILE_BY_USERNAME_WITH_POSITIONING_SQL
    );
    positioningEnabled.mockReturnValue(false);
  });
});

describe("toProfileIdentityRecord", () => {
  it("produces what the PostgREST projection produced", () => {
    expect(toProfileIdentityRecord(fullRow)).toEqual({
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
      verified: true,
      verified_type: "institution",
      interests: ["governance", "policy"],
      profile_type: "student",
      professional_title: null,
      organization_name: null,
      organization_website: null,
    });
  });

  it("keeps no interests and never answered apart", () => {
    expect(toProfileIdentityRecord({ ...fullRow, interests: [] }).interests).toEqual(
      []
    );
    expect(
      toProfileIdentityRecord({ ...fullRow, interests: null }).interests
    ).toBeNull();
  });

  it("parses the array literal an untyped driver would hand over", () => {
    expect(
      toProfileIdentityRecord({ ...fullRow, interests: "{governance,policy}" })
        .interests
    ).toEqual(["governance", "policy"]);
  });

  it("omits positioning_statement entirely when it was not selected", () => {
    // Not present as null: the Supabase adapter omits the key, and the parity
    // check compares shapes.
    expect("positioning_statement" in toProfileIdentityRecord(fullRow)).toBe(
      false
    );
  });

  it("carries positioning_statement through when it was, null included", () => {
    expect(
      toProfileIdentityRecord({ ...fullRow, positioning_statement: "Building X" })
        .positioning_statement
    ).toBe("Building X");
    const withNull = toProfileIdentityRecord({
      ...fullRow,
      positioning_statement: null,
    });
    expect("positioning_statement" in withNull).toBe(true);
    expect(withNull.positioning_statement).toBeNull();
  });

  it("does not let an unreadable verified flag become a badge", () => {
    expect(toProfileIdentityRecord({ ...fullRow, verified: null }).verified).toBe(
      false
    );
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
    // The viewer is the second parameter, because the profiles policy decides
    // whether this profile is found at all. Null is the logged-out reader.
    expect(calls[0].params).toEqual(["student1", null]);
    // Flat and scalar. A nested array here is the class of bug that took every
    // post page down in Phase 3.
    expect(
      calls[0].params.every(
        (param) => param === null || typeof param === "string"
      )
    ).toBe(true);
  });

  it("carries the profiles policy, so a private profile is not found", () => {
    // The rule PostgREST applied from the session, inlined. Without it the
    // direct lookup renders a private profile to whoever guessed the username.
    expect(profileByUsernameSql()).toMatch(/suspended_at is null/);
    expect(profileByUsernameSql()).toMatch(/members_only/);
    expect(profileByUsernameSql()).toMatch(/\$2::uuid/);
    expect(profileByUsernameSql()).not.toMatch(/auth\.uid\(\)/);
  });

  it("returns null for a username that matched nothing", async () => {
    const { executor } = fakeExecutor([]);

    await expect(
      createPostgresProfilesRepository(executor).findIdentityByUsername("nobody")
    ).resolves.toBeNull();
  });

  it("throws when one username matched two rows", async () => {
    const { executor } = fakeExecutor([fullRow, fullRow]);

    await expect(
      createPostgresProfilesRepository(executor).findIdentityByUsername("student1")
    ).rejects.toThrow(/Failed to load profile/);
  });

  it("does not put the database message into the thrown surface text", async () => {
    const executor = failingExecutor(
      new Error('relation "profiles" does not exist')
    );

    await expect(
      createPostgresProfilesRepository(executor).findIdentityByUsername("student1")
    ).rejects.toThrow(/^Failed to load profile "student1"\.$/);
  });
});
