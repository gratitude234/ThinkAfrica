import { describe, expect, it, vi } from "vitest";

/**
 * A small, self-contained fake Supabase client local to this file --
 * deliberately not reusing lib/testUtils/supabaseMock.ts, which doesn't
 * support .rpc() and is currently untracked/in-flux from unrelated parallel
 * work, so extending it here would risk that work rather than help this one.
 */
type QueryResult = { data?: unknown; error?: unknown };

function builder(result: QueryResult = { data: null, error: null }) {
  const promise = Promise.resolve(result);
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => promise,
    single: () => promise,
    then: (onFulfilled: (v: QueryResult) => unknown, onRejected?: (r: unknown) => unknown) =>
      promise.then(onFulfilled, onRejected),
  };
  return chain;
}

function makeClient(routes: Record<string, () => ReturnType<typeof builder>>, rpcResult: QueryResult = { data: null, error: null }) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "viewer-1" } } })) },
    from: vi.fn((table: string) => (routes[table] ? routes[table]() : builder({ data: null, error: null }))),
    rpc: vi.fn(async () => rpcResult),
  };
}

function baseDebateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "debate-1",
    title: "Should X happen?",
    description: null,
    status: "open",
    format_version: 2,
    moderator_id: null,
    round_duration_minutes: 30,
    tags: [],
    created_at: "2026-07-17T00:00:00.000Z",
    ends_at: null,
    closure_kind: null,
    profiles: null,
    ...overrides,
  };
}

const fakeClient = { current: null as ReturnType<typeof makeClient> | null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fakeClient.current),
}));

import { loadDebateV2Room } from "./loadRoomData";

describe("loadDebateV2Room", () => {
  it("throws instead of silently rendering an empty room when a core query actually fails", async () => {
    fakeClient.current = makeClient({
      debates: () => builder({ data: baseDebateRow(), error: null }),
      debate_rounds: () => builder({ data: null, error: { message: "connection reset" } }),
      debate_memberships: () => builder({ data: [], error: null }),
      debate_arguments: () => builder({ data: [], error: null }),
      debate_ballots: () => builder({ data: [], error: null }),
      profiles: () => builder({ data: null, error: null }),
    });

    await expect(loadDebateV2Room("debate-1")).rejects.toThrow(/rounds/);
  });

  it("throws when the arguments query fails, rather than reporting 'no arguments yet'", async () => {
    fakeClient.current = makeClient({
      debates: () => builder({ data: baseDebateRow(), error: null }),
      debate_rounds: () => builder({ data: [], error: null }),
      debate_memberships: () => builder({ data: [], error: null }),
      debate_arguments: () => builder({ data: null, error: { message: "timeout" } }),
      debate_ballots: () => builder({ data: [], error: null }),
      profiles: () => builder({ data: null, error: null }),
    });

    await expect(loadDebateV2Room("debate-1")).rejects.toThrow(/arguments/);
  });

  it("treats a debate that isn't format_version 2 as not found, defensively, even if this loader is reached directly", async () => {
    fakeClient.current = makeClient({
      debates: () => builder({ data: baseDebateRow({ format_version: 1 }), error: null }),
    });

    await expect(loadDebateV2Room("debate-1")).resolves.toBeNull();
  });

  it("returns null (not found) when the debate row itself doesn't exist", async () => {
    fakeClient.current = makeClient({
      debates: () => builder({ data: null, error: null }),
    });

    await expect(loadDebateV2Room("debate-1")).resolves.toBeNull();
  });

  it("builds a well-formed room view on the happy path, including debaters and cross-examination exchanges", async () => {
    fakeClient.current = makeClient(
      {
        debates: () => builder({ data: baseDebateRow({ status: "active" }), error: null }),
        debate_rounds: () =>
          builder({
            data: [
              { id: "round-1", sequence_number: 1, phase: "opening", status: "completed", starts_at: null, ends_at: null, duration_minutes: 5, started_at: null, completed_at: null },
              { id: "round-3", sequence_number: 3, phase: "cross_examination", status: "active", starts_at: null, ends_at: null, duration_minutes: 5, started_at: null, completed_at: null },
            ],
            error: null,
          }),
        debate_memberships: () =>
          builder({
            data: [
              { user_id: "viewer-1", role: "debater", stance: "for", profiles: { id: "viewer-1", username: "viewer", full_name: "Viewer One", university: null, avatar_url: null } },
              { user_id: "target-1", role: "debater", stance: "against", profiles: { id: "target-1", username: "target", full_name: "Target One", university: null, avatar_url: null } },
            ],
            error: null,
          }),
        debate_arguments: () =>
          builder({
            data: [
              {
                id: "arg-1",
                author_id: "viewer-1",
                stance: "for",
                entry_type: "opening",
                claim: "A claim",
                content: "Some content",
                round_id: "round-1",
                parent_argument_id: null,
                relation_type: null,
                created_at: "2026-07-17T00:00:00.000Z",
                edited_at: null,
                profiles: { id: "viewer-1", username: "viewer", full_name: "Viewer One", university: null, avatar_url: null },
              },
            ],
            error: null,
          }),
        debate_cross_exchanges: () =>
          builder({
            data: [
              {
                id: "exchange-1",
                round_id: "round-3",
                asker_id: "target-1",
                target_id: "viewer-1",
                target_argument_id: "arg-1",
                question: "Why do you believe that?",
                answer: null,
                answered_at: null,
                created_at: "2026-07-17T00:10:00.000Z",
                updated_at: "2026-07-17T00:10:00.000Z",
                asker: { id: "target-1", username: "target", full_name: "Target One", university: null, avatar_url: null },
                target: { id: "viewer-1", username: "viewer", full_name: "Viewer One", university: null, avatar_url: null },
              },
            ],
            error: null,
          }),
        debate_ballots: () => builder({ data: [], error: null }),
        profiles: () => builder({ data: { role: "student" }, error: null }),
        debate_argument_sources: () => builder({ data: [], error: null }),
        debate_reactions: () => builder({ data: [], error: null }),
      },
      { data: null, error: { code: "P0001", message: "Cast a ballot in this stage, or wait for it to end, to see results." } }
    );

    const room = await loadDebateV2Room("debate-1");

    expect(room).not.toBeNull();
    expect(room!.arguments).toHaveLength(1);
    expect(room!.debate.status).toBe("active");
    expect(room!.ballotResults).toEqual({ initial: null, final: null });

    expect(room!.debaters).toEqual([
      { userId: "viewer-1", profile: expect.objectContaining({ id: "viewer-1", full_name: "Viewer One" }), stance: "for" },
      { userId: "target-1", profile: expect.objectContaining({ id: "target-1", full_name: "Target One" }), stance: "against" },
    ]);

    expect(room!.crossExchanges).toHaveLength(1);
    const exchange = room!.crossExchanges[0];
    expect(exchange.askerId).toBe("target-1");
    expect(exchange.asker?.full_name).toBe("Target One");
    expect(exchange.targetId).toBe("viewer-1");
    expect(exchange.target?.full_name).toBe("Viewer One");
    expect(exchange.answer).toBeNull();
    // targetArgument is resolved from the arguments already fetched in the
    // same batch (buildParentRef), not a second query -- confirms no N+1.
    expect(exchange.targetArgument).toEqual({ id: "arg-1", claim: "A claim", authorName: "Viewer One", stance: "for" });
  });

  it("throws when the cross-examination exchanges query fails, rather than reporting an empty list", async () => {
    fakeClient.current = makeClient({
      debates: () => builder({ data: baseDebateRow({ status: "active" }), error: null }),
      debate_rounds: () => builder({ data: [], error: null }),
      debate_memberships: () => builder({ data: [], error: null }),
      debate_arguments: () => builder({ data: [], error: null }),
      debate_cross_exchanges: () => builder({ data: null, error: { message: "timeout" } }),
      debate_ballots: () => builder({ data: [], error: null }),
      profiles: () => builder({ data: null, error: null }),
    });

    await expect(loadDebateV2Room("debate-1")).rejects.toThrow(/cross-examination/);
  });

  it("throws when the debate query itself fails, rather than treating it as not-found", async () => {
    fakeClient.current = makeClient({
      debates: () => builder({ data: null, error: { message: "connection reset" } }),
    });

    await expect(loadDebateV2Room("debate-1")).rejects.toThrow(/debate/);
  });

  it("throws when the caller's profile-role query fails, instead of silently hiding editor/admin controls", async () => {
    fakeClient.current = makeClient({
      debates: () => builder({ data: baseDebateRow(), error: null }),
      debate_rounds: () => builder({ data: [], error: null }),
      debate_memberships: () => builder({ data: [], error: null }),
      debate_arguments: () => builder({ data: [], error: null }),
      debate_ballots: () => builder({ data: [], error: null }),
      profiles: () => builder({ data: null, error: { message: "timeout" } }),
    });

    await expect(loadDebateV2Room("debate-1")).rejects.toThrow(/profile role/);
  });

  it("throws on a genuine ballot-results failure instead of treating it as merely 'not visible yet'", async () => {
    fakeClient.current = makeClient(
      {
        debates: () => builder({ data: baseDebateRow({ status: "active" }), error: null }),
        debate_rounds: () => builder({ data: [], error: null }),
        debate_memberships: () => builder({ data: [], error: null }),
        debate_arguments: () => builder({ data: [], error: null }),
        debate_ballots: () => builder({ data: [], error: null }),
        profiles: () => builder({ data: null, error: null }),
      },
      // No P0001 code -- a real connection/server error, not the RPC's own
      // deliberate visibility rejection.
      { data: null, error: { message: "connection reset" } }
    );

    await expect(loadDebateV2Room("debate-1")).rejects.toThrow(/ballot results/);
  });
});
