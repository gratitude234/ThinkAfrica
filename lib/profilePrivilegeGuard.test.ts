import { describe, expect, it } from "vitest";
import {
  applyProfileInsertPrivilegeDefaults,
  isProfilePrivilegeChangeBlocked,
  type ProfilePrivilegeFields,
} from "@/lib/profilePrivilegeGuard";

const student: ProfilePrivilegeFields = { role: "student", verified: false, verified_type: null };
const verifiedStudent: ProfilePrivilegeFields = {
  role: "student",
  verified: true,
  verified_type: "student",
};
const admin: ProfilePrivilegeFields = { role: "admin", verified: true, verified_type: "faculty" };

describe("protect_profile_privileged_columns (ported from SQL for testability)", () => {
  it("blocks an authenticated user from changing their own role", () => {
    expect(
      isProfilePrivilegeChangeBlocked("authenticated", student, { ...student, role: "admin" })
    ).toBe(true);
  });

  it("blocks an authenticated user from setting verified = true on themselves", () => {
    expect(
      isProfilePrivilegeChangeBlocked("authenticated", student, { ...student, verified: true })
    ).toBe(true);
  });

  it("blocks an authenticated user from changing verified_type alone", () => {
    expect(
      isProfilePrivilegeChangeBlocked("authenticated", verifiedStudent, {
        ...verifiedStudent,
        verified_type: "faculty",
      })
    ).toBe(true);
  });

  it("blocks all three fields changing at once, same as any one of them", () => {
    expect(isProfilePrivilegeChangeBlocked("authenticated", student, admin)).toBe(true);
  });

  it("allows an authenticated user's update when none of the three fields change", () => {
    // Mirrors IS DISTINCT FROM: round-tripping the same values (e.g. a form
    // that sends the full profile object back unchanged) must not trip the
    // trigger.
    expect(isProfilePrivilegeChangeBlocked("authenticated", student, { ...student })).toBe(false);
  });

  it("allows an authenticated user's ordinary profile edits that don't touch these columns", () => {
    const before: ProfilePrivilegeFields = student;
    const after: ProfilePrivilegeFields = { ...student };
    expect(isProfilePrivilegeChangeBlocked("authenticated", before, after)).toBe(false);
  });

  it("allows the service-role admin client to change role/verified/verified_type", () => {
    expect(isProfilePrivilegeChangeBlocked("service_role", student, admin)).toBe(false);
  });

  it("allows a connection with no JWT role claim (direct SQL, migrations) to change them", () => {
    expect(isProfilePrivilegeChangeBlocked(null, student, admin)).toBe(false);
  });

  it("only ever blocks when the requester's role is exactly 'authenticated'", () => {
    for (const role of ["service_role", "anon", null, "postgres"]) {
      expect(isProfilePrivilegeChangeBlocked(role, student, admin)).toBe(false);
    }
    expect(isProfilePrivilegeChangeBlocked("authenticated", student, admin)).toBe(true);
  });
});

describe("correction pass: protect_profile_privileged_columns_on_insert", () => {
  it("resets an authenticated client's attempted role/verified/verified_type to safe defaults", () => {
    expect(applyProfileInsertPrivilegeDefaults("authenticated", admin)).toEqual(student);
  });

  it("leaves a normal insert (already at the safe defaults) unchanged", () => {
    expect(applyProfileInsertPrivilegeDefaults("authenticated", student)).toEqual(student);
  });

  it("does not affect handle_new_user()'s automatic university-email verification", () => {
    // handle_new_user() inserts through Supabase Auth's own internal
    // connection, which carries no JWT role claim -- requestRole is null,
    // never 'authenticated' -- so an auto-verified row must pass through
    // exactly as handle_new_user() built it.
    const autoVerifiedRow: ProfilePrivilegeFields = {
      role: "student",
      verified: true,
      verified_type: "student",
    };
    expect(applyProfileInsertPrivilegeDefaults(null, autoVerifiedRow)).toEqual(autoVerifiedRow);
  });

  it("allows the service-role admin client to insert non-default values", () => {
    expect(applyProfileInsertPrivilegeDefaults("service_role", admin)).toEqual(admin);
  });

  it("never rejects the insert outright, only strips the privileged fields", () => {
    // Unlike isProfilePrivilegeChangeBlocked, this never returns a
    // rejection -- the row is always returned, just with role/verified/
    // verified_type coerced when the requester is authenticated.
    const result = applyProfileInsertPrivilegeDefaults("authenticated", {
      role: "admin",
      verified: true,
      verified_type: "institution",
    });
    expect(result).not.toBeNull();
    expect(result.role).toBe("student");
    expect(result.verified).toBe(false);
    expect(result.verified_type).toBeNull();
  });
});
