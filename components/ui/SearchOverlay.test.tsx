import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function mockSupabaseWithResults(results: Array<Record<string, unknown>>) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            ilike: () => ({
              limit: () => Promise.resolve({ data: results }),
            }),
          }),
        }),
      }),
    }),
  }));
}

async function searchAndGetResult(result: Record<string, unknown>) {
  vi.resetModules();
  mockSupabaseWithResults([result]);
  const { default: SearchOverlayFresh } = await import("./SearchOverlay");

  render(<SearchOverlayFresh isOpen onClose={vi.fn()} />);
  await userEvent.type(screen.getByRole("textbox"), "test query");

  return screen.findByText(String(result.title));
}

describe("SearchOverlay Reviewed badge", () => {
  it("does not claim a pending policy brief is Reviewed based on type alone", async () => {
    await searchAndGetResult({
      id: "1",
      title: "A pending policy brief",
      slug: "p1",
      type: "policy_brief",
      citation_id: null,
      published_version_id: null,
      profiles: null,
    });

    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
  });

  it("shows Reviewed once a policy brief has an accepted published version", async () => {
    await searchAndGetResult({
      id: "2",
      title: "An accepted policy brief",
      slug: "p2",
      type: "policy_brief",
      citation_id: null,
      published_version_id: "11111111-1111-1111-1111-111111111111",
      profiles: null,
    });

    expect(await screen.findByText("Reviewed")).toBeInTheDocument();
  });
});
