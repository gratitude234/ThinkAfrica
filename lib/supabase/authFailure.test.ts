import { describe, expect, it } from "vitest";
import { AuthUnavailableError, isRetryableAuthFailure } from "./authFailure";

describe("isRetryableAuthFailure", () => {
  it.each([
    ["a fetch that never reached Auth", { name: "AuthRetryableFetchError", status: 0 }],
    ["a gateway timeout", { name: "AuthRetryableFetchError", status: 504 }],
    ["the server deadline", { name: "SupabaseTimeoutError", message: "Supabase did not respond within 8000ms." }],
    ["a concurrent refresh", { name: "AuthApiError", status: 409, message: "concurrent token refresh" }],
  ])("counts %s as Auth not answering", (_label, error) => {
    expect(isRetryableAuthFailure(error)).toBe(true);
  });

  it.each([
    ["no session", { name: "AuthSessionMissingError", status: 400, message: "Auth session missing!" }],
    ["a spent refresh token", { name: "AuthApiError", status: 400, message: "Invalid Refresh Token: Already Used" }],
    ["a bad signature", { name: "AuthInvalidJwtError", status: 400, message: "Invalid JWT signature" }],
    ["nothing at all", null],
  ])("counts %s as an answer", (_label, error) => {
    expect(isRetryableAuthFailure(error)).toBe(false);
  });
});

describe("AuthUnavailableError", () => {
  it("keeps what Auth failed with", () => {
    const reason = { name: "AuthRetryableFetchError", status: 0 };
    const error = new AuthUnavailableError(reason);
    expect(error.name).toBe("AuthUnavailableError");
    expect(error.reason).toBe(reason);
  });
});
