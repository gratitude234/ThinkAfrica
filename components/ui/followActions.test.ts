import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { setAuthorSubscription, toggleFollow } from "./followActions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/push", () => ({
  ENGAGEMENT_PUSH_COOLDOWN_MS: 1,
  logPushResult: vi.fn(),
  sendPushNotification: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

function relationshipClient(row: {
  following: boolean;
  subscribed: boolean;
  follow_created: boolean;
}) {
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

describe("author relationship actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
  });

  it("Subscribe requests Follow and Subscribe in one transaction", async () => {
    const { rpc } = relationshipClient({
      following: true,
      subscribed: true,
      follow_created: true,
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
