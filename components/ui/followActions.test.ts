import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setAuthorSubscription, toggleFollow } from "./followActions";

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
vi.mock("@/lib/push", () => ({
  ENGAGEMENT_PUSH_COOLDOWN_MS: 1,
  logPushResult: vi.fn(),
  sendPushNotification: vi.fn().mockResolvedValue({ ok: true, sent: 1 }),
}));

const mockedCreateClient = vi.mocked(createClient);
const mockedCreateAdminClient = vi.mocked(createAdminClient);

type RelationshipRow = {
  following: boolean;
  subscribed: boolean;
  follow_created: boolean;
  subscription_created: boolean;
};

function relationshipClient(row: RelationshipRow) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const rpc = vi.fn(() => ({ single }));
  mockedCreateClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "reader-id" } },
      }),
    },
    rpc,
  } as never);
  return { rpc, single };
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

describe("author relationship actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
  });

  it("Subscribe requests Follow and Subscribe in one transaction", async () => {
    const { rpc } = relationshipClient({
      following: true,
      subscribed: true,
      follow_created: true,
      subscription_created: true,
    });

    const result = await setAuthorSubscription({
      authorId: "author-id",
      subscribed: true,
      pathname: "/author",
    });

    expect(rpc).toHaveBeenCalledWith("set_author_relationship", {
      p_author_id: "author-id",
      p_following: true,
      p_subscribed: true,
    });
    expect(result).toEqual({
      error: null,
      following: true,
      subscribed: true,
      followCreated: true,
    });
  });

  it("Unsubscribe leaves the Follow state returned by the RPC intact", async () => {
    const { rpc } = relationshipClient({
      following: true,
      subscribed: false,
      follow_created: false,
      subscription_created: false,
    });

    const result = await setAuthorSubscription({
      authorId: "author-id",
      subscribed: false,
    });

    expect(rpc).toHaveBeenCalledWith("set_author_relationship", {
      p_author_id: "author-id",
      p_following: null,
      p_subscribed: false,
    });
    expect(result.following).toBe(true);
    expect(result.subscribed).toBe(false);
  });

  it("Unfollow returns both states cleared", async () => {
    const { rpc } = relationshipClient({
      following: false,
      subscribed: false,
      follow_created: false,
      subscription_created: false,
    });

    const result = await toggleFollow({
      followingId: "author-id",
      follow: false,
    });

    expect(rpc).toHaveBeenCalledWith("set_author_relationship", {
      p_author_id: "author-id",
      p_following: false,
      p_subscribed: null,
    });
    expect(result).toEqual({
      error: null,
      following: false,
      subscribed: false,
    });
  });
});

describe("author subscriber notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
  });

  it("tells the author they were subscribed to, not followed", async () => {
    // Subscribing creates the underlying Follow too, so both flags are true for
    // this single click. Only the stronger notification may be sent.
    relationshipClient({
      following: true,
      subscribed: true,
      follow_created: true,
      subscription_created: true,
    });
    const { insert } = adminClient();

    await setAuthorSubscription({ authorId: "author-id", subscribed: true });
    await runAfterCallbacks();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "author-id",
        type: "author_subscribed",
        actor_id: "reader-id",
        message: "Tunde Bello subscribed to your work on Indegenius.",
        link: "/tunde",
      })
    );
  });

  it("notifies when an existing follower subscribes", async () => {
    relationshipClient({
      following: true,
      subscribed: true,
      follow_created: false,
      subscription_created: true,
    });
    const { insert } = adminClient();

    await setAuthorSubscription({ authorId: "author-id", subscribed: true });
    await runAfterCallbacks();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: "author_subscribed" })
    );
  });

  it("stays silent when the subscription already existed", async () => {
    relationshipClient({
      following: true,
      subscribed: true,
      follow_created: false,
      subscription_created: false,
    });
    const { insert } = adminClient();

    await setAuthorSubscription({ authorId: "author-id", subscribed: true });
    await runAfterCallbacks();

    expect(insert).not.toHaveBeenCalled();
  });

  it("still sends a plain follow notification from toggleFollow", async () => {
    relationshipClient({
      following: true,
      subscribed: false,
      follow_created: true,
      subscription_created: false,
    });
    const { insert } = adminClient();

    await toggleFollow({ followingId: "author-id", follow: true });
    await runAfterCallbacks();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: "follow" })
    );
  });
});
