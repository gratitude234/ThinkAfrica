import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClient(),
}));

type QueryResult = { data: unknown[] | null; error: { message: string } | null };

/** Chainable stand-in for a Supabase query builder that settles as `response`. */
function query(response: Promise<QueryResult>) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "not", "in", "order", "limit", "abortSignal"]) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
    response.then(resolve, reject);
  return chain;
}

const never = () => new Promise<QueryResult>(() => {});
const rows = (data: unknown[]) => Promise.resolve({ data, error: null });

function client(responses: Record<string, () => Promise<QueryResult>>) {
  return {
    from: (table: string) => query((responses[table] ?? (() => rows([])))()),
  };
}

async function loadSitemap() {
  vi.resetModules();
  const mod = await import("./sitemap");
  return mod.default;
}

describe("sitemap", () => {
  beforeEach(() => {
    process.env.SITEMAP_QUERY_TIMEOUT_MS = "50";
  });

  afterEach(() => {
    delete process.env.SITEMAP_QUERY_TIMEOUT_MS;
    vi.restoreAllMocks();
  });

  it("falls back to static routes when the admin client is unconfigured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    createAdminClient.mockImplementation(() => {
      throw new Error("Supabase admin client is not configured.");
    });

    const entries = await (await loadSitemap())();

    expect(entries.every((entry) => !entry.url.includes("/post/"))).toBe(true);
    expect(entries.some((entry) => entry.url.endsWith("/landing"))).toBe(true);
  });

  it("gives up on queries that never settle instead of hanging the render", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    createAdminClient.mockReturnValue(client({ posts: never, profiles: never, debates: never }));

    const started = Date.now();
    const entries = await (await loadSitemap())();

    expect(Date.now() - started).toBeLessThan(2000);
    expect(entries.some((entry) => entry.url.endsWith("/landing"))).toBe(true);
    expect(entries.some((entry) => entry.url.includes("/post/"))).toBe(false);
  });

  it("keeps healthy tables when one query fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    createAdminClient.mockReturnValue(
      client({
        posts: () =>
          rows([
            {
              slug: "african-energy",
              title: "African energy futures",
              type: "essay",
              content_kind: "article",
              published_at: "2026-01-01T00:00:00Z",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: null,
              author_id: "author-1",
            },
          ]),
        profiles: () => Promise.resolve({ data: null, error: { message: "boom" } }),
        debates: () => rows([{ id: "debate-1", created_at: "2026-01-01T00:00:00Z", ends_at: null }]),
      })
    );

    const entries = await (await loadSitemap())();
    const urls = entries.map((entry) => entry.url);

    expect(urls.some((url) => url.endsWith("/post/african-energy"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/debates/debate-1"))).toBe(true);
  });

  it("drops low-quality titles but keeps titleless lightweight posts", async () => {
    createAdminClient.mockReturnValue(
      client({
        posts: () =>
          rows([
            {
              slug: "untitled-draft",
              title: "untitled",
              type: "blog",
              content_kind: "article",
              published_at: null,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: null,
              author_id: "author-1",
            },
            {
              slug: "quick-take",
              title: null,
              type: "blog",
              content_kind: "post",
              published_at: null,
              created_at: "2026-01-02T00:00:00Z",
              updated_at: null,
              author_id: "author-2",
            },
          ]),
      })
    );

    const urls = (await (await loadSitemap())()).map((entry) => entry.url);

    expect(urls.some((url) => url.endsWith("/post/untitled-draft"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/post/quick-take"))).toBe(true);
  });
});
