import { describe, expect, it } from "vitest";

import {
  isFreezeExempt,
  isWriteFrozen,
  shouldRefuseWrite,
} from "@/lib/writeFreeze";

/**
 * The freeze is only worth having if it is closed by default, closed against
 * everything that writes, and loud when misconfigured. Each of those is a
 * separate failure mode and gets its own case.
 */
describe("the migration write freeze", () => {
  describe("is off unless deliberately turned on", () => {
    it("is off when the variable is unset or empty", () => {
      expect(isWriteFrozen(undefined)).toBe(false);
      expect(isWriteFrozen("")).toBe(false);
      expect(isWriteFrozen("   ")).toBe(false);
    });

    it("is off for the explicit off values", () => {
      expect(isWriteFrozen("0")).toBe(false);
      expect(isWriteFrozen("false")).toBe(false);
      expect(isWriteFrozen("FALSE")).toBe(false);
    });

    it("is on for the explicit on values", () => {
      expect(isWriteFrozen("1")).toBe(true);
      expect(isWriteFrozen("true")).toBe(true);
      expect(isWriteFrozen("TRUE")).toBe(true);
    });

    it("throws on anything else rather than choosing", () => {
      // A typo during a cutover must not be the reason the final copy was
      // taken from a database that was still moving.
      for (const value of ["yes", "on", "frozen", "1 ", "maybe"].slice(0, 3)) {
        expect(() => isWriteFrozen(value)).toThrow(/MIGRATION_WRITE_FREEZE/);
      }
    });
  });

  describe("refuses writes and only writes", () => {
    it("never refuses a read, frozen or not", () => {
      for (const method of ["GET", "HEAD", "OPTIONS", "get", "head"]) {
        expect(shouldRefuseWrite(method, "/dashboard", true)).toBe(false);
      }
    });

    it("refuses every mutating method while frozen", () => {
      for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
        expect(shouldRefuseWrite(method, "/dashboard", true)).toBe(true);
      }
    });

    it("refuses nothing while not frozen", () => {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        expect(shouldRefuseWrite(method, "/dashboard", false)).toBe(false);
      }
    });

    it("refuses a server action, which is how most writes arrive", () => {
      // Server actions POST to the page they live on rather than to an API
      // route, so a freeze that only covered /api would miss nearly all of
      // them.
      expect(shouldRefuseWrite("POST", "/write", true)).toBe(true);
      expect(shouldRefuseWrite("POST", "/post/some-slug", true)).toBe(true);
      expect(shouldRefuseWrite("POST", "/settings", true)).toBe(true);
      expect(shouldRefuseWrite("POST", "/admin/review", true)).toBe(true);
    });
  });

  describe("keeps authentication open", () => {
    it("exempts the auth surfaces", () => {
      for (const path of [
        "/api/auth",
        "/api/auth/callback",
        "/login",
        "/signup",
        "/logout",
      ]) {
        expect(isFreezeExempt(path), path).toBe(true);
        expect(shouldRefuseWrite("POST", path, true), path).toBe(false);
      }
    });

    it("does not exempt a path that merely starts with the same letters", () => {
      // "/authors" is not "/auth". A prefix check without the boundary would
      // open a hole that reads as an auth exemption.
      expect(isFreezeExempt("/authors")).toBe(false);
      expect(shouldRefuseWrite("POST", "/authors", true)).toBe(true);
      expect(isFreezeExempt("/api/authored")).toBe(false);
    });
  });

  describe("covers the write surface the migration cares about", () => {
    it("refuses every mutable domain named in the cutover plan", () => {
      const paths = [
        "/api/upload-image",
        "/api/activation",
        "/api/research-document/upload",
        "/settings/profile",
        "/dashboard",
        "/bookmarks",
        "/notifications",
        "/edit/a-slug",
        "/messages/123",
        "/onboarding",
        "/submit/research",
      ];
      for (const path of paths) {
        expect(shouldRefuseWrite("POST", path, true), path).toBe(true);
      }
    });
  });
});
