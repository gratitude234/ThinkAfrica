import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The route that replaced the browser's open insert into `contact_requests`.
 *
 * lib/contactRequests.test.ts covers validation. This covers the three limits
 * and the two things a public endpoint must not do: leak whether an address
 * has been seen before, and keep accepting writes when it cannot tell.
 */

vi.mock("server-only", () => ({}));

const state = {
  perEmailCount: 0,
  globalCount: 0,
  countError: null as unknown,
  insertError: null as unknown,
  inserted: [] as unknown[],
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      expect(table).toBe("contact_requests");
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        gte() {
          return builder;
        },
        insert(row: unknown) {
          state.inserted.push(row);
          return Promise.resolve({ error: state.insertError });
        },
        then(
          onFulfilled: (value: { count: number | null; error: unknown }) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) {
          // The per-email query is the one that filters on email; the global
          // burst query filters on nothing.
          const count =
            filters.email === undefined ? state.globalCount : state.perEmailCount;
          return Promise.resolve({
            count: state.countError ? null : count,
            error: state.countError,
          }).then(onFulfilled, onRejected);
        },
      };
      return builder as never;
    },
  }),
}));

const { POST } = await import("@/app/api/partner-contact/route");
const { PER_EMAIL_DAILY_LIMIT, GLOBAL_BURST_LIMIT } = await import(
  "@/lib/contactRequests"
);
const { resetRateLimits } = await import("@/lib/rateLimit");

const body = {
  name: "Ada Lovelace",
  organization: "Analytical Engines",
  email: "ada@example.org",
  message: "We would like to discuss a research partnership with Indegenius.",
};

function request(overrides: Partial<typeof body> = {}, address = "203.0.113.9") {
  return new Request("https://indegenius.test/api/partner-contact", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": address },
    body: JSON.stringify({ ...body, ...overrides }),
  });
}

beforeEach(() => {
  resetRateLimits();
  state.perEmailCount = 0;
  state.globalCount = 0;
  state.countError = null;
  state.insertError = null;
  state.inserted = [];
});

describe("POST /api/partner-contact", () => {
  it("accepts a valid submission and writes exactly the four validated fields", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(state.inserted).toEqual([body]);
  });

  it("rejects an invalid submission without writing", async () => {
    const response = await POST(request({ email: "not-an-address" }));

    expect(response.status).toBe(400);
    expect(state.inserted).toEqual([]);
  });

  it("rejects a body that is not JSON", async () => {
    const response = await POST(
      new Request("https://indegenius.test/api/partner-contact", {
        method: "POST",
        body: "{not json",
      })
    );

    expect(response.status).toBe(400);
    expect(state.inserted).toEqual([]);
  });

  it("refuses once the same address has reached its daily count", async () => {
    state.perEmailCount = PER_EMAIL_DAILY_LIMIT;

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toEqual(expect.any(String));
    expect(state.inserted).toEqual([]);
  });

  it("refuses once the table has taken a burst, whoever is sending", async () => {
    state.globalCount = GLOBAL_BURST_LIMIT;

    const response = await POST(request({ email: "someone-else@example.org" }));

    expect(response.status).toBe(429);
    expect(state.inserted).toEqual([]);
  });

  it("throttles one caller in this process before reaching the database", async () => {
    // The in-memory limit is the cheap first line. Six from one address in an
    // hour is past it.
    const responses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      responses.push(await POST(request({ email: `a${attempt}@example.org` })));
    }

    expect(responses.slice(0, 5).map((r) => r.status)).toEqual([
      201, 201, 201, 201, 201,
    ]);
    expect(responses[5].status).toBe(429);
    expect(state.inserted).toHaveLength(5);
  });

  it("counts each address separately", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await POST(request({ email: `a${attempt}@example.org` }, "203.0.113.9"));
    }
    const other = await POST(request({ email: "b@example.org" }, "198.51.100.4"));
    expect(other.status).toBe(201);
  });

  it("fails closed when a limit cannot be evaluated", async () => {
    // An unbounded insert path is what this route exists to remove, so a limit
    // that cannot be checked is not one to skip.
    state.countError = { message: "connection reset" };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(state.inserted).toEqual([]);
    error.mockRestore();
  });

  it("says the same thing whether or not the address has written before", async () => {
    state.perEmailCount = PER_EMAIL_DAILY_LIMIT;
    const limited = await POST(request());
    resetRateLimits();
    state.globalCount = GLOBAL_BURST_LIMIT;
    state.perEmailCount = 0;
    const burst = await POST(request({ email: "never-seen@example.org" }));

    // A different message per limit would tell a stranger whether a given
    // address has used the product.
    expect(await limited.json()).toEqual(await burst.json());
  });

  it("never returns the database's own message", async () => {
    state.insertError = {
      message: 'new row violates row-level security policy for table "contact_requests"',
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(request());
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(payload.error).not.toMatch(/row-level security|policy|contact_requests/);
    error.mockRestore();
  });
});
