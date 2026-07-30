import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSignOut } from "./useSignOut";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signOut: mocks.signOut,
    },
  }),
}));

describe("useSignOut", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.signOut.mockReset();
  });

  it("redirects and refreshes after a successful sign out", async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useSignOut());

    let signedOut = false;
    await act(async () => {
      signedOut = await result.current.signOut();
    });

    expect(signedOut).toBe(true);
    expect(mocks.push).toHaveBeenCalledWith("/login");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
  });

  it("keeps the user in place and exposes an auth failure", async () => {
    mocks.signOut.mockResolvedValue({
      error: { message: "The session could not be closed." },
    });
    const { result } = renderHook(() => useSignOut());

    let signedOut = true;
    await act(async () => {
      signedOut = await result.current.signOut();
    });

    expect(signedOut).toBe(false);
    expect(result.current.error).toBe("The session could not be closed.");
    expect(result.current.isSigningOut).toBe(false);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("ignores a second request while sign out is already pending", async () => {
    let resolveRequest:
      | ((value: { error: null }) => void)
      | undefined;
    mocks.signOut.mockReturnValue(
      new Promise<{ error: null }>((resolve) => {
        resolveRequest = resolve;
      })
    );
    const { result } = renderHook(() => useSignOut());

    let firstRequest: Promise<boolean> | undefined;
    await act(async () => {
      firstRequest = result.current.signOut();
      await Promise.resolve();
    });

    expect(result.current.isSigningOut).toBe(true);

    let secondResult = true;
    await act(async () => {
      secondResult = await result.current.signOut();
    });

    expect(secondResult).toBe(false);
    expect(mocks.signOut).toHaveBeenCalledOnce();

    await act(async () => {
      resolveRequest?.({ error: null });
      await firstRequest;
    });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/login"));
  });
});
