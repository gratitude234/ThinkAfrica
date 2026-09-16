import { describe, expect, it, vi } from "vitest";

/**
 * The adapter selector. Small surface, but it is the switch that decides which
 * database a production request talks to, so each of its three outcomes is
 * pinned: unset means Supabase, a known name means that provider, and anything
 * else is an error rather than a quiet fallback.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

const { resolveAdapterName, createDatabase } = await import("@/lib/db");
const {
  PostgresConnectionError,
  resolveConnectionString,
  resetPostgresConnectionForTests,
  POSTGRES_POOL_OPTIONS,
} = await import("@/lib/db/postgres/connection");

describe("resolveAdapterName", () => {
  it("defaults to Supabase when the variable is absent or blank", () => {
    expect(resolveAdapterName(undefined)).toBe("supabase");
    expect(resolveAdapterName("")).toBe("supabase");
    expect(resolveAdapterName("   ")).toBe("supabase");
  });

  it("accepts the two adapters by name", () => {
    expect(resolveAdapterName("supabase")).toBe("supabase");
    expect(resolveAdapterName("postgres")).toBe("postgres");
  });

  it("rejects an unrecognised value instead of falling back", () => {
    // A typo during a cutover must not be indistinguishable from a deliberate
    // decision to stay on Supabase.
    expect(() => resolveAdapterName("neon")).toThrow(/DATABASE_ADAPTER/);
    expect(() => resolveAdapterName("Supabase")).toThrow(/Received "Supabase"/);
  });
});

describe("createDatabase", () => {
  it("hands back the Supabase posts repository by default", () => {
    const db = createDatabase("supabase");
    expect(db.adapter).toBe("supabase");
    expect(typeof db.posts.findBySlug).toBe("function");
  });

  it("refuses the Postgres adapter with a named error when it has no connection string", () => {
    // Failing here, at selection, is what keeps a missing DATABASE_URL from
    // surfacing as a stack trace on the first article view.
    resetPostgresConnectionForTests();
    vi.stubEnv("DATABASE_URL", "");

    expect(() => createDatabase("postgres")).toThrow(PostgresConnectionError);
    expect(() => createDatabase("postgres")).toThrow(/DATABASE_URL is not set/);

    vi.unstubAllEnvs();
    resetPostgresConnectionForTests();
  });

  it("builds a Postgres repository once a connection string exists", () => {
    resetPostgresConnectionForTests();
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/indegenius");

    const db = createDatabase("postgres");
    expect(db.adapter).toBe("postgres");
    expect(typeof db.posts.findBySlug).toBe("function");

    vi.unstubAllEnvs();
    resetPostgresConnectionForTests();
  });
});

describe("the connection", () => {
  it("reads the pooled URL, never the direct one", () => {
    // DATABASE_URL_DIRECT is the unpooled admin connection for migrations. It
    // belongs to a different role, and runtime traffic on it is how a schema
    // change becomes an outage.
    resetPostgresConnectionForTests();
    expect(
      resolveConnectionString({
        DATABASE_URL: "postgres://pooled/db",
        DATABASE_URL_DIRECT: "postgres://direct/db",
      } as NodeJS.ProcessEnv)
    ).toBe("postgres://pooled/db");

    expect(() =>
      resolveConnectionString({
        DATABASE_URL_DIRECT: "postgres://direct/db",
      } as NodeJS.ProcessEnv)
    ).toThrow(PostgresConnectionError);
  });

  it("keeps the pool small and unprepared, which is not a preference", () => {
    // A Worker may hold at most six TCP connections, and both intended targets
    // are transaction-mode poolers where a named prepared statement is not
    // guaranteed to land on the connection that prepared it.
    expect(POSTGRES_POOL_OPTIONS.max).toBeLessThanOrEqual(5);
    expect(POSTGRES_POOL_OPTIONS.prepare).toBe(false);
    expect(POSTGRES_POOL_OPTIONS.fetch_types).toBe(false);
  });

  it("carries the fail-fast deadline across from the Supabase client", () => {
    // lib/supabase/fetchTimeout.ts exists because a database that stopped
    // answering held a Vercel function open for 300 seconds. The direct-SQL
    // equivalent must not be lost in the port. This is the statement deadline,
    // and it is the one that matters.
    expect(POSTGRES_POOL_OPTIONS.connection.statement_timeout).toBe(8000);
  });

  it("bounds the handshake without mistaking it for the query deadline", () => {
    // connect_timeout guards a TCP and TLS handshake, not a statement, so it
    // is not what prevents the 300-second hang. It was 10s, which measured too
    // tight: a fresh connection from a machine in another region takes 4.6 to
    // 8.4 seconds, so 10 left about two seconds of headroom and produced
    // intermittent hard failures for no gain. It still has to bound something.
    expect(POSTGRES_POOL_OPTIONS.connect_timeout).toBeGreaterThanOrEqual(15);
    expect(POSTGRES_POOL_OPTIONS.connect_timeout).toBeLessThanOrEqual(30);
  });
});
