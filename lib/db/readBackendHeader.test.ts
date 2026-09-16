import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  READ_BACKEND_HEADER,
  readBackendHeaders,
} from "@/lib/db/readBackendHeader";

/**
 * The canary instrument has to be right about two things: it must say nothing
 * at all unless asked, and when asked it must report what actually happened
 * rather than what was intended. A header that claimed "postgres" while the
 * request ran on PostgREST would be worse than no header, because the canary
 * would be verified by reading it.
 */
describe("the read backend header", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("says nothing unless switched on", () => {
    delete process.env.READ_BACKEND_HEADER;
    expect(readBackendHeaders("search")).toEqual({});

    for (const value of ["", "0", "false", "no"]) {
      process.env.READ_BACKEND_HEADER = value;
      expect(readBackendHeaders("search"), value).toEqual({});
    }
  });

  it("reports supabase while the domain is not migrated", () => {
    process.env.READ_BACKEND_HEADER = "1";
    delete process.env.READ_MIGRATED_DOMAINS;
    expect(readBackendHeaders("search")).toEqual({
      [READ_BACKEND_HEADER]: "supabase",
    });
  });

  it("reports postgres once the domain is migrated", () => {
    process.env.READ_BACKEND_HEADER = "1";
    process.env.READ_MIGRATED_DOMAINS = "search";
    expect(readBackendHeaders("search")).toEqual({
      [READ_BACKEND_HEADER]: "postgres",
    });
  });

  it("is per domain, so one enabled domain does not vouch for another", () => {
    process.env.READ_BACKEND_HEADER = "1";
    process.env.READ_MIGRATED_DOMAINS = "search";
    expect(readBackendHeaders("search")[READ_BACKEND_HEADER]).toBe("postgres");
    expect(readBackendHeaders("feed")[READ_BACKEND_HEADER]).toBe("supabase");
    expect(readBackendHeaders("comments")[READ_BACKEND_HEADER]).toBe("supabase");
  });

  it("tracks the flag rather than caching the first answer", () => {
    // A module-level cache would make the header permanently wrong after a
    // rollback, which is exactly when it is being relied on most.
    process.env.READ_BACKEND_HEADER = "1";
    process.env.READ_MIGRATED_DOMAINS = "search";
    expect(readBackendHeaders("search")[READ_BACKEND_HEADER]).toBe("postgres");

    delete process.env.READ_MIGRATED_DOMAINS;
    expect(readBackendHeaders("search")[READ_BACKEND_HEADER]).toBe("supabase");
  });

  it("carries no value other than the two backend names", () => {
    process.env.READ_BACKEND_HEADER = "1";
    process.env.READ_MIGRATED_DOMAINS = "search";
    const value = readBackendHeaders("search")[READ_BACKEND_HEADER];
    // No host, no connection string, no credential can reach this header.
    expect(["postgres", "supabase"]).toContain(value);
  });
});
