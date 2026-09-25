import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { makeFakeSupabase, queueResults } from "@/lib/testUtils/supabaseMock";

const { fakeSupabase } = vi.hoisted(() => ({
  fakeSupabase: { current: null as ReturnType<typeof makeFakeSupabase> | null },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fakeSupabase.current),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));
vi.mock("./UniversalComposer", () => ({ default: () => null }));

import WritePage from "./page";

async function composerProps(params: Record<string, string>) {
  fakeSupabase.current = makeFakeSupabase({
    profiles: queueResults({
      data: { full_name: "Ada", username: "ada", university: null, avatar_url: "https://cdn.example/ada.png" },
      error: null,
    }),
  });
  const element = (await WritePage({ searchParams: Promise.resolve(params) })) as ReactElement<{
    initialSurface: string | null;
    profile: { avatar_url: string | null };
  }>;
  return element.props;
}

describe("the write page", () => {
  it("opens the Article editor when the address asks for it", async () => {
    expect((await composerProps({ editor: "article" })).initialSurface).toBe("article");
  });

  it("ignores a screen it does not know", async () => {
    expect((await composerProps({ editor: "research" })).initialSurface).toBeNull();
  });

  it("ignores the retired format parameters", async () => {
    expect((await composerProps({ kind: "article" })).initialSurface).toBeNull();
  });

  it("reads the writer's avatar for the byline", async () => {
    expect((await composerProps({})).profile.avatar_url).toBe("https://cdn.example/ada.png");
  });
});
