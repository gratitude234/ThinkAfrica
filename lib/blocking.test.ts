import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBlockedUserIds,
  getFeedExcludedUserIds,
  getPostIdsWithExcludedAuthors,
} from "./blocking";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const mockedAdminClient = vi.mocked(createAdminClient);

function queryResult(result: { data: unknown[] | null; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "not", "or"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

describe("blocking feed exclusions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fails closed when strict feed exclusions cannot be loaded", async () => {
    mockedAdminClient.mockReturnValue({
      from: vi.fn(() =>
        queryResult({ data: null, error: { message: "unavailable" } })
      ),
    } as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      getBlockedUserIds("viewer-1", { strict: true })
    ).rejects.toThrow("Unable to apply blocked-user exclusions");

    errorSpy.mockRestore();
  });

  it("deduplicates posts credited to an excluded accepted coauthor", async () => {
    mockedAdminClient.mockReturnValue({
      from: vi.fn(() =>
        queryResult({
          data: [
            { post_id: "post-1" },
            { post_id: "post-1" },
            { post_id: "post-2" },
          ],
          error: null,
        })
      ),
    } as never);

    await expect(
      getPostIdsWithExcludedAuthors(
        ["post-1", "post-2"],
        ["blocked-author"],
        { strict: true }
      )
    ).resolves.toEqual(["post-1", "post-2"]);
  });

  it("excludes users on either side of a block from the feed", async () => {
    mockedAdminClient.mockReturnValue({
      from: vi.fn(() =>
        queryResult({
          data: [
            { blocker_id: "viewer-1", blocked_id: "author-a" },
            { blocker_id: "author-b", blocked_id: "viewer-1" },
          ],
          error: null,
        })
      ),
    } as never);

    await expect(
      getFeedExcludedUserIds("viewer-1", { strict: true })
    ).resolves.toEqual(["author-a", "author-b"]);
  });
});
