import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The endpoint exists to be trusted during a cutover, so the two things worth
 * testing are that it refuses strangers and that it reports the flags as they
 * actually are rather than as they were at module load.
 */
describe("the migration status endpoint", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...original };
  });

  async function call(headers: Record<string, string> = {}) {
    const { GET } = await import("@/app/api/migration-status/route");
    const request = new Request("https://example.test/api/migration-status", {
      headers,
    });
    return GET(request as never);
  }

  it("refuses a request with no secret", async () => {
    process.env.ADMIN_SECRET = "the-secret";
    const response = await call();
    expect(response.status).toBe(403);
  });

  it("refuses a request with the wrong secret", async () => {
    process.env.ADMIN_SECRET = "the-secret";
    const response = await call({ "x-internal-secret": "not-the-secret" });
    expect(response.status).toBe(403);
  });

  it("refuses everyone when no secret is configured", async () => {
    // Otherwise an environment that forgot to set ADMIN_SECRET would publish
    // its migration state to anyone who guessed the path.
    delete process.env.ADMIN_SECRET;
    expect((await call({ "x-internal-secret": "" })).status).toBe(403);
    expect((await call()).status).toBe(403);
  });

  it("reports nothing migrated when the flag is unset, and does not probe", async () => {
    process.env.ADMIN_SECRET = "the-secret";
    delete process.env.READ_MIGRATED_DOMAINS;
    delete process.env.DATABASE_URL;

    const response = await call({ "x-internal-secret": "the-secret" });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.migratedCount).toBe(0);
    expect(body.domains.search).toBe("supabase");
    // Resolving the executor without DATABASE_URL throws by design, so the
    // probe must not run merely because someone asked for status.
    expect(body.database.probed).toBe(false);
  });

  it("reports a domain as migrated once the flag names it", async () => {
    process.env.ADMIN_SECRET = "the-secret";
    process.env.READ_MIGRATED_DOMAINS = "search";

    const body = await (await call({ "x-internal-secret": "the-secret" })).json();
    expect(body.domains.search).toBe("postgres");
    expect(body.domains.feed).toBe("supabase");
    expect(body.migratedCount).toBe(1);
    expect(body.flags.readMigratedDomains).toBe("search");
  });

  it("reports an invalid freeze flag instead of failing the request", async () => {
    process.env.ADMIN_SECRET = "the-secret";
    process.env.MIGRATION_WRITE_FREEZE = "yes-please";

    // During a cutover the status endpoint is how you find out a variable is
    // wrong. It going down with the same error is the least useful response.
    const response = await call({ "x-internal-secret": "the-secret" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(String(body.flags.writeFrozen)).toMatch(/invalid/);
  });
});
