import { vi } from "vitest";

type QueryResult = { data?: unknown; error?: unknown };

/**
 * A minimal fake Supabase query builder: every chain method (`select`,
 * `eq`, `in`, ...) returns the same builder so calls can be chained in any
 * order the real client allows, `single`/`maybeSingle` resolve the given
 * result, and the builder itself is thenable so `await supabase.from(...).update(...)`
 * (no terminal `.single()`) resolves the same way the real client does.
 * `insertedWith`/`updatedWith`/`upsertedWith` capture the payload passed to
 * the corresponding write call for assertions.
 */
export function makeBuilder(result: QueryResult = { data: null, error: null }) {
  const promise = Promise.resolve(result);
  const builder: Record<string, unknown> = {
    insertedWith: undefined,
    updatedWith: undefined,
    upsertedWith: undefined,
    select: vi.fn(() => builder),
    insert: vi.fn((payload: unknown) => {
      builder.insertedWith = payload;
      return builder;
    }),
    update: vi.fn((payload: unknown) => {
      builder.updatedWith = payload;
      return builder;
    }),
    upsert: vi.fn((payload: unknown) => {
      builder.upsertedWith = payload;
      return builder;
    }),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
      promise.then(onFulfilled, onRejected),
    catch: (onRejected: (reason: unknown) => unknown) => promise.catch(onRejected),
  };
  return builder;
}

/** Returns a `routes[table]` factory that yields a new builder per call, holding on the last result once exhausted. */
export function queueResults(...results: QueryResult[]) {
  let index = 0;
  return () => {
    const result = results[Math.min(index, results.length - 1)] ?? { data: null, error: null };
    index += 1;
    return makeBuilder(result);
  };
}

export function makeFakeSupabase(
  routes: Record<string, () => ReturnType<typeof makeBuilder>> = {},
  userId: string | null = "user-1",
  rpcResults: Record<string, () => QueryResult> = {}
) {
  const builders: Record<string, ReturnType<typeof makeBuilder>[]> = {};
  const rpcCalls: Array<{ fn: string; params: unknown }> = [];

  const from = vi.fn((table: string) => {
    const factory = routes[table];
    const builder = factory ? factory() : makeBuilder({ data: null, error: null });
    builders[table] = builders[table] ?? [];
    builders[table].push(builder);
    return builder;
  });

  const rpc = vi.fn((fn: string, params: unknown) => {
    rpcCalls.push({ fn, params });
    const factory = rpcResults[fn];
    const result = factory ? factory() : { data: null, error: null };
    return Promise.resolve(result);
  });

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } })),
    },
    from,
    rpc,
    builders,
    rpcCalls,
  };
}
