import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBlockedPair } from "@/lib/blocking";
import { toggleFollow } from "./followActions";

// Captured rather than executed inline so each test controls when the
// after-response notification work runs, and can assert it never ran.
const { afterCallbacks } = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({
  after: vi.fn((callback: () => unknown) => {
    afterCallbacks.push(callback);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/blocking", () => ({ isBlockedPair: vi.fn() }));
vi.mock("@/lib/push", () => ({
  ENGAGEMENT_PUSH_COOLDOWN_MS: 1,
  logPushResult: vi.fn(),
  sendPushNotification: vi.fn().mockResolvedValue({ ok: true, sent: 1 }),
}));

const mockedCreateClient = vi.mocked(createClient);
const mockedCreateAdminClient = vi.mocked(createAdminClient);
const mockedIsBlockedPair = vi.mocked(isBlockedPair);

/** A request client whose `follows` table is the only thing it knows. */
function followsClient({
  user = { id: "reader-id" } as { id: string } | null,
  existing = null as unknown,
  insertError = null as { code?: string; message: string } | null,
} = {}) {
  const tables: string[] = [];
  const rpc = vi.fn();
  const insert = vi.fn().mockResolvedValue({ error: insertError });
  const deleteFilters: Array<[string, unknown]> = [];
  const deleteBuilder = {
    eq: vi.fn((column: string, value: unknown) => {
      deleteFilters.push([column, value]);
      return deleteFilters.length === 2 ? Promise.resolve({ error: null }) : deleteBuilder;
    }),
  };
  const selectBuilder: Record<string, unknown> = {};
  selectBuilder.eq = vi.fn(() => selectBuilder);
  selectBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null });

  mockedCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    rpc,
    from: vi.fn((table: string) => {
      tables.push(table);
      return {
        select: vi.fn(() => selectBuilder),
        insert,
        delete: vi.fn(() => deleteBuilder),
      };
    }),
  } as never);

  return { tables, rpc, insert, deleteFilters };
}

function adminClient() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { username: "tunde", full_name: "Tunde Bello" },
  });
  mockedCreateAdminClient.mockReturnValue({
    from: vi.fn((table: string) =>
      table === "profiles"
        ? { select: () => ({ eq: () => ({ maybeSingle }) }) }
        : { insert }
    ),
  } as never);
  return { insert };
}

async function runAfterCallbacks() {
  const pending = [...afterCallbacks];
  afterCallbacks.length = 0;
  await Promise.all(pending.map((callback) => callback()));
}

describe("toggleFollow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    mockedIsBlockedPair.mockResolvedValue(false);
  });

  it("writes one follows row and nothing else", async () => {
    const { tables, rpc, insert } = followsClient();
    adminClient();

    const result = await toggleFollow({ followingId: "author-id", follow: true });

    expect(result).toEqual({ error: null, following: true });
    expect(insert).toHaveBeenCalledWith({
      follower_id: "reader-id",
      following_id: "author-id",
    });
    expect(new Set(tables)).toEqual(new Set(["follows"]));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("unfollows by deleting the viewer's own row", async () => {
    const { deleteFilters, insert } = followsClient();

    const result = await toggleFollow({ followingId: "author-id", follow: false });

    expect(result).toEqual({ error: null, following: false });
    expect(deleteFilters).toEqual([
      ["follower_id", "reader-id"],
      ["following_id", "author-id"],
    ]);
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses a signed-out reader before touching the table", async () => {
    const { tables } = followsClient({ user: null });

    const result = await toggleFollow({ followingId: "author-id", follow: true });

    expect(result.error).toMatch(/signed in/);
    expect(tables).toEqual([]);
  });

  it("refuses to follow yourself", async () => {
    const { tables } = followsClient({ user: { id: "author-id" } });

    const result = await toggleFollow({ followingId: "author-id", follow: true });

    expect(result).toEqual({ error: "You cannot follow yourself.", following: false });
    expect(tables).toEqual([]);
  });

  it("refuses a follow across a block, in either direction", async () => {
    const { insert } = followsClient();
    mockedIsBlockedPair.mockResolvedValue(true);

    const result = await toggleFollow({ followingId: "author-id", follow: true });

    expect(mockedIsBlockedPair).toHaveBeenCalledWith("reader-id", "author-id");
    expect(result.following).toBe(false);
    expect(result.error).toBeTruthy();
    expect(insert).not.toHaveBeenCalled();
  });

  it("treats an existing follow as success and does not notify twice", async () => {
    const { insert } = followsClient({ existing: { follower_id: "reader-id" } });
    const admin = adminClient();

    const result = await toggleFollow({ followingId: "author-id", follow: true });
    await runAfterCallbacks();

    expect(result).toEqual({ error: null, following: true });
    expect(insert).not.toHaveBeenCalled();
    expect(admin.insert).not.toHaveBeenCalled();
  });

  it("treats a concurrent duplicate insert as the follow it asked for", async () => {
    followsClient({ insertError: { code: "23505", message: "duplicate key" } });
    const admin = adminClient();

    const result = await toggleFollow({ followingId: "author-id", follow: true });
    await runAfterCallbacks();

    expect(result).toEqual({ error: null, following: true });
    expect(admin.insert).not.toHaveBeenCalled();
  });

  it("reports a failed insert as not following", async () => {
    followsClient({ insertError: { message: "permission denied" } });

    const result = await toggleFollow({ followingId: "author-id", follow: true });

    expect(result).toEqual({ error: "permission denied", following: false });
  });
});

describe("follow notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    mockedIsBlockedPair.mockResolvedValue(false);
  });

  it("tells the member they were followed, after the response", async () => {
    followsClient();
    const { insert } = adminClient();

    await toggleFollow({ followingId: "author-id", follow: true });
    expect(insert).not.toHaveBeenCalled();
    await runAfterCallbacks();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({
      user_id: "author-id",
      type: "follow",
      message: "Tunde Bello started following you on Indegenius.",
      link: "/tunde",
      actor_id: "reader-id",
      read: false,
    });
  });

  it("sends nothing when a follow is removed", async () => {
    followsClient();
    const { insert } = adminClient();

    await toggleFollow({ followingId: "author-id", follow: false });
    await runAfterCallbacks();

    expect(insert).not.toHaveBeenCalled();
  });
});
