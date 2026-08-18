import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeadline, withDeadline } from "./queryDeadline";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("withDeadline", () => {
  it("returns the work result when it beats the deadline", async () => {
    const deadline = createDeadline(1000);

    await expect(withDeadline("fast", Promise.resolve("done"), deadline, "fallback")).resolves.toBe(
      "done"
    );

    deadline.cancel();
  });

  it("falls back when the work never settles", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const deadline = createDeadline(10);

    await expect(
      withDeadline("stuck", new Promise<string>(() => {}), deadline, "fallback")
    ).resolves.toBe("fallback");
    expect(warn).toHaveBeenCalled();

    deadline.cancel();
  });

  it("falls back when the work rejects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const deadline = createDeadline(1000);

    await expect(
      withDeadline("broken", Promise.reject(new Error("nope")), deadline, "fallback")
    ).resolves.toBe("fallback");
    expect(warn).toHaveBeenCalled();

    deadline.cancel();
  });

  it("shares one deadline across concurrent work", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const deadline = createDeadline(10);

    const results = await Promise.all([
      withDeadline("quick", Promise.resolve(1), deadline, 0),
      withDeadline("stuck", new Promise<number>(() => {}), deadline, 0),
    ]);

    expect(results).toEqual([1, 0]);
    deadline.cancel();
  });
});

describe("createDeadline", () => {
  it("aborts its signal once the deadline passes", async () => {
    const deadline = createDeadline(5);
    expect(deadline.signal.aborted).toBe(false);

    await deadline.expired;

    expect(deadline.signal.aborted).toBe(true);
    deadline.cancel();
  });

  it("does not abort after it is cancelled", async () => {
    const deadline = createDeadline(5);
    deadline.cancel();

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(deadline.signal.aborted).toBe(false);
  });
});
