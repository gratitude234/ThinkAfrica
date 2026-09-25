import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { AuthUnavailableError } from "@/lib/supabase/authFailure";
import { getUserForProtectedPage } from "./serverAuth";

function clientAnswering(answer: { user: unknown; error: unknown }) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: answer.user }, error: answer.error }),
    },
  } as unknown as Pick<SupabaseClient, "auth">;
}

describe("getUserForProtectedPage", () => {
  it("returns the signed-in user", async () => {
    const user = { id: "user-1" };
    await expect(getUserForProtectedPage(clientAnswering({ user, error: null }))).resolves.toBe(user);
  });

  it("returns null for a visitor with no session, so the page can send them to sign in", async () => {
    const missing = { name: "AuthSessionMissingError", status: 400, message: "Auth session missing!" };
    await expect(getUserForProtectedPage(clientAnswering({ user: null, error: missing }))).resolves.toBeNull();
  });

  it("throws rather than answering null when Auth did not respond", async () => {
    const timeout = {
      name: "AuthRetryableFetchError",
      status: 0,
      message: "Supabase did not respond within 8000ms.",
    };
    await expect(
      getUserForProtectedPage(clientAnswering({ user: null, error: timeout }))
    ).rejects.toBeInstanceOf(AuthUnavailableError);
  });
});
