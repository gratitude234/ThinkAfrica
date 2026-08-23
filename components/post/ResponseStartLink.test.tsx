import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResponseStartLink from "./ResponseStartLink";

const mocks = vi.hoisted(() => ({ requestAuth: vi.fn(), track: vi.fn() }));
vi.mock("@/components/ui/GuestAuthGateProvider", () => ({ useGuestAuthGate: () => ({ requestAuth: mocks.requestAuth }) }));
vi.mock("@/lib/activationEvents", () => ({ trackActivationEvent: mocks.track }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));

describe("ResponseStartLink", () => {
  beforeEach(() => { mocks.requestAuth.mockReset(); mocks.track.mockReset(); });

  it("opens one universal response canvas without a chooser", () => {
    render(<ResponseStartLink postId="parent-1" userId="user-1" />);
    expect(screen.getByRole("link", { name: "Write a response" })).toHaveAttribute("href", "/write?inResponseTo=parent-1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preserves starter intent without adding a format parameter", () => {
    render(<ResponseStartLink postId="parent-1" userId="user-1" starter="response" responseIntent="challenge" />);
    const href = screen.getByRole("link").getAttribute("href") ?? "";
    expect(href).toContain("inResponseTo=parent-1");
    expect(href).toContain("starter=response");
    expect(href).toContain("responseIntent=challenge");
    expect(href).not.toContain("kind=");
  });

  it("gates guests to the same contextual canvas", () => {
    render(<ResponseStartLink postId="parent-1" userId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Write a response" }));
    expect(mocks.requestAuth).toHaveBeenCalledWith("respond", { destination: "/write?inResponseTo=parent-1" });
  });
});
