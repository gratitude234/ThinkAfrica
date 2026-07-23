import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomeGuestNotice from "./HomeGuestNotice";

describe("HomeGuestNotice", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/?guest=1&tab=home");
  });

  afterEach(() => cleanup());

  it("renders inline (not fixed/floating) with the mockup copy and a Sign in action", () => {
    const { container } = render(<HomeGuestNotice />);

    expect(
      screen.getByText("Browsing as a guest. Sign in to like, save, respond, and publish.")
    ).toBeInTheDocument();
    const signIn = screen.getByRole("button", { name: "Sign in" });
    expect(signIn).toBeInTheDocument();

    const notice = container.firstElementChild as HTMLElement;
    expect(notice.className).not.toMatch(/\bfixed\b/);
  });

  it("does not primarily say Sign up", () => {
    render(<HomeGuestNotice />);
    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument();
  });

  it("has no dismiss button and never touches localStorage", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    render(<HomeGuestNotice />);

    expect(
      screen.queryByRole("button", { name: /dismiss|close/i })
    ).not.toBeInTheDocument();
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it("sends Sign in to /login with the current path, query, and hash preserved", () => {
    window.history.replaceState(null, "", "/?guest=1&tab=home#featured");
    const originalHref = window.location.href;
    let assignedHref: string | undefined;

    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        get href() {
          return assignedHref ?? originalHref;
        },
        set href(value: string) {
          assignedHref = value;
        },
        pathname: "/",
        search: "?guest=1&tab=home",
        hash: "#featured",
      },
    });

    render(<HomeGuestNotice />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(assignedHref).toBe(
      "/login?redirectTo=%2F%3Fguest%3D1%26tab%3Dhome%23featured"
    );
  });
});
