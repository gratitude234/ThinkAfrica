import { describe, expect, it, vi } from "vitest";
import { loadProfileRecordSummary } from "./profileRecordData";

/**
 * The summary is fetched through two functions in order, which is the
 * deployment seam between this code and 20260907000001 rather than
 * indecision. These pin the three outcomes that matter: the migration is
 * applied, it is not applied yet, and the database is broken.
 */
function clientWithRpc(
  responses: Record<string, { data?: unknown; error?: unknown }>
) {
  const calls: string[] = [];
  const client = {
    rpc: (name: string) => {
      calls.push(name);
      const response = responses[name];
      if (!response) {
        return Promise.resolve({
          data: null,
          error: { message: `Could not find the function public.${name}`, code: "PGRST202" },
        });
      }
      return Promise.resolve({ data: null, error: null, ...response });
    },
  } as never;
  return { client, calls };
}

const V2_ROW = {
  publication_count: 7,
  source_backed_count: 3,
  citable_count: 1,
  response_count: 2,
  research_count: 0,
  article_count: 5,
  post_count: 2,
};

const V1_ROW = {
  publication_count: 7,
  source_backed_count: 3,
  citable_count: 1,
  response_count: 2,
  research_count: 0,
};

describe("loadProfileRecordSummary", () => {
  it("uses the split-aware function when the database has it", async () => {
    const { client, calls } = clientWithRpc({
      get_public_profile_record_summary_v2: { data: [V2_ROW] },
    });

    const summary = await loadProfileRecordSummary(client, "author-1", false);

    expect(calls).toEqual(["get_public_profile_record_summary_v2"]);
    expect(summary.publicationCount).toBe(7);
    expect(summary.articleCount).toBe(5);
    expect(summary.postCount).toBe(2);
    // The invariant the migration's counts are built on.
    expect((summary.articleCount ?? 0) + (summary.postCount ?? 0)).toBe(
      summary.publicationCount
    );
  });

  /**
   * OLD DB, NEW APP. This is the case that decides whether the application
   * can ship before the migration, and the answer has to be "the profile
   * renders, just without the split" rather than an error page.
   */
  it("falls back to the deployed function when the new one is absent", async () => {
    const { client, calls } = clientWithRpc({
      get_public_profile_record_summary: { data: [V1_ROW] },
    });

    const summary = await loadProfileRecordSummary(client, "author-1", false);

    expect(calls).toEqual([
      "get_public_profile_record_summary_v2",
      "get_public_profile_record_summary",
    ]);
    expect(summary.publicationCount).toBe(7);
    expect(summary.responseCount).toBe(2);
    // Unknown, not zero. Nothing may print "0 articles" on this.
    expect(summary.articleCount).toBeNull();
    expect(summary.postCount).toBeNull();
  });

  it("recognises the absence by code as well as by message", async () => {
    const calls: string[] = [];
    const client = {
      rpc: (name: string) => {
        calls.push(name);
        if (name.endsWith("_v2")) {
          return Promise.resolve({
            data: null,
            error: { message: "not in schema cache", code: "PGRST202" },
          });
        }
        return Promise.resolve({ data: [V1_ROW], error: null });
      },
    } as never;

    await expect(
      loadProfileRecordSummary(client, "author-1", false)
    ).resolves.toMatchObject({ articleCount: null });
    expect(calls).toHaveLength(2);
  });

  /**
   * A real failure is not a missing function and must not be swallowed by the
   * fallback. Counts are identity-critical: a profile that quietly reports
   * zero publications during an outage is worse than one that says it could
   * not load.
   */
  it("throws on a query failure instead of falling back", async () => {
    const fallback = vi.fn();
    const client = {
      rpc: (name: string) => {
        if (name.endsWith("_v2")) {
          return Promise.resolve({
            data: null,
            error: { message: "statement timeout", code: "57014" },
          });
        }
        fallback();
        return Promise.resolve({ data: [V1_ROW], error: null });
      },
    } as never;

    await expect(
      loadProfileRecordSummary(client, "author-1", false)
    ).rejects.toThrow(/statement timeout/);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("throws when the fallback itself fails", async () => {
    const client = {
      rpc: (name: string) =>
        Promise.resolve(
          name.endsWith("_v2")
            ? { data: null, error: { message: "missing", code: "PGRST202" } }
            : { data: null, error: { message: "connection refused" } }
        ),
    } as never;

    await expect(
      loadProfileRecordSummary(client, "author-1", false)
    ).rejects.toThrow(/connection refused/);
  });

  it("reports an empty record as zero rather than unknown", async () => {
    const { client } = clientWithRpc({
      get_public_profile_record_summary_v2: { data: [] },
    });

    const summary = await loadProfileRecordSummary(client, "author-1", false);

    expect(summary.publicationCount).toBe(0);
    expect(summary.articleCount).toBe(0);
    expect(summary.postCount).toBe(0);
  });
});
