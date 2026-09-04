import { describe, expect, it, vi } from "vitest";
import {
  BroadcastEmailSourceError,
  CONTACT_EMAILS_RPC,
  loadBroadcastContactEmails,
} from "@/lib/broadcastAuthEmails";

/**
 * Regression cover for the production outage this module was written to fix.
 *
 * The sync read member addresses through auth.admin.listUsers, which answered
 * 500 "Database error finding users" on every page wide enough to include one
 * of five auth rows seeded by direct SQL. GoTrue models the token columns as
 * non-nullable Go strings, so a NULL in any of them fails the deserialisation
 * of the whole request. Narrower pages worked, which made it look like a page
 * size limit rather than five bad rows.
 *
 * Two properties matter now: addresses are read in SQL rather than through
 * that API, and a read that fails stops the run loudly instead of syncing a
 * truncated audience and stamping it fresh.
 */

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };

/**
 * A stub shaped like the admin client. The RPC builder is thenable and carries
 * order/range, which is how the real call pages a set-returning function.
 */
function adminStub(pages: RpcResult[]) {
  const calls: { name: string; from: number; to: number }[] = [];
  let index = 0;

  const listUsers = vi.fn(async () => {
    throw new Error("auth.admin.listUsers must not be used to read addresses.");
  });

  const admin = {
    auth: { admin: { listUsers } },
    rpc: (name: string) => {
      const builder = {
        order: () => builder,
        range: (from: number, to: number) => {
          calls.push({ name, from, to });
          return builder;
        },
        then: (resolve: (value: RpcResult) => unknown) =>
          Promise.resolve(resolve(pages[index++] ?? { data: [], error: null })),
      };
      return builder;
    },
  };

  // The module reads only rpc(); the rest of the admin client is irrelevant to
  // it, so a stub of that shape is a faithful stand-in for the real one.
  return {
    admin: admin as unknown as Parameters<typeof loadBroadcastContactEmails>[0],
    calls,
    listUsers,
  };
}

function rows(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({
    profile_id: `p${offset + index}`,
    email: `member${offset + index}@example.com`,
  }));
}

describe("reading member addresses", () => {
  it("reads them through the SQL function, not the auth admin API", async () => {
    // The whole point of the fix: never construct the GoTrue user struct that
    // cannot represent a NULL token column.
    const { admin, calls, listUsers } = adminStub([
      { data: rows(3), error: null },
    ]);

    const emails = await loadBroadcastContactEmails(admin);

    expect(calls[0].name).toBe(CONTACT_EMAILS_RPC);
    expect(listUsers).not.toHaveBeenCalled();
    expect(emails.get("p0")).toBe("member0@example.com");
    expect(emails.size).toBe(3);
  });

  it("pages a result larger than one PostgREST response", async () => {
    const { admin, calls } = adminStub([
      { data: rows(1000), error: null },
      { data: rows(120, 1000), error: null },
    ]);

    const emails = await loadBroadcastContactEmails(admin);

    expect(emails.size).toBe(1120);
    expect(calls.map((call) => [call.from, call.to])).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("skips a row carrying no address rather than storing an empty one", async () => {
    const { admin } = adminStub([
      {
        data: [
          { profile_id: "p1", email: "member@example.com" },
          { profile_id: "p2", email: null },
        ],
        error: null,
      },
    ]);

    const emails = await loadBroadcastContactEmails(admin);

    expect(emails.size).toBe(1);
    expect(emails.has("p2")).toBe(false);
  });
});

describe("when addresses cannot be read", () => {
  it("says which migration is missing rather than reporting a database error", async () => {
    // The exact PostgREST answer when the function is not in the schema cache,
    // captured from the live project before the migration was applied.
    const { admin } = adminStub([
      {
        data: null,
        error: {
          code: "PGRST202",
          message:
            "Could not find the function public.list_broadcast_contact_emails without parameters in the schema cache",
        },
      },
    ]);

    await expect(loadBroadcastContactEmails(admin)).rejects.toThrow(
      /20260903000001_broadcast_auth_emails\.sql/
    );
  });

  it("recognises the undefined-function code from Postgres too", async () => {
    const { admin } = adminStub([
      {
        data: null,
        error: { code: "42883", message: "function does not exist" },
      },
    ]);

    await expect(loadBroadcastContactEmails(admin)).rejects.toThrow(/is missing/);
  });

  it("stops the run on any other read failure instead of carrying on", async () => {
    // Carrying on would push a truncated audience into the Resend segments and
    // then stamp them fresh, which is the one state the send path trusts.
    const { admin } = adminStub([
      { data: null, error: { code: "57014", message: "statement timeout" } },
    ]);

    const error = await loadBroadcastContactEmails(admin).catch((e) => e);

    expect(error).toBeInstanceOf(BroadcastEmailSourceError);
    expect(error.message).toContain("statement timeout");
  });

  it("never falls back to profiles.signup_email", async () => {
    // Four of this project's 252 members have it populated. A fallback would
    // not fail; it would quietly sync a near-empty audience and report success.
    const { admin } = adminStub([
      { data: null, error: { code: "PGRST202", message: "Could not find the function" } },
    ]);

    await expect(loadBroadcastContactEmails(admin)).rejects.toThrow();
  });

  it("refuses an empty result rather than emptying every audience", async () => {
    // Zero addressable members would remove every contact from every segment
    // and then mark the segments fresh, which is worse than failing.
    const { admin } = adminStub([{ data: [], error: null }]);

    await expect(loadBroadcastContactEmails(admin)).rejects.toThrow(
      /returned no rows/
    );
  });
});
