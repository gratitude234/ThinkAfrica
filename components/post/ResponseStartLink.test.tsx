import type { AnchorHTMLAttributes } from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResponseStartLink from "./ResponseStartLink";

const navigationState = vi.hoisted(() => ({ pathname: "/post/some-post" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock("@/lib/activationEvents", () => ({
  trackActivationEvent: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

describe("ResponseStartLink -- bare 'Respond' click opens the shared chooser", () => {
  beforeEach(() => {
    navigationState.pathname = "/post/some-post";
  });

  afterEach(() => cleanup());

  it("opens a dialog offering exactly Quick response and Long-form response", () => {
    render(<ResponseStartLink postId="parent-post-id" />);

    const trigger = screen.getByRole("button", { name: "Write a response" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Respond" });
    expect(dialog).toBeInTheDocument();

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAccessibleName(/^Quick response/);
    expect(links[1]).toHaveAccessibleName(/^Long-form response/);
  });

  it("never offers Research as a response format", () => {
    render(<ResponseStartLink postId="parent-post-id" />);
    fireEvent.click(screen.getByRole("button", { name: "Write a response" }));

    const links = screen.getAllByRole("link").map((link) => link.textContent ?? "");
    expect(links.some((text) => /research/i.test(text))).toBe(false);
  });

  it("retains the parent post id on both options", () => {
    render(<ResponseStartLink postId="parent-post-id" />);
    fireEvent.click(screen.getByRole("button", { name: "Write a response" }));

    const quick = screen.getByRole("link", { name: /^Quick response/ });
    const longForm = screen.getByRole("link", { name: /^Long-form response/ });
    expect(quick).toHaveAttribute("href", expect.stringContaining("inResponseTo=parent-post-id"));
    expect(longForm).toHaveAttribute(
      "href",
      expect.stringContaining("inResponseTo=parent-post-id")
    );
  });

  it("routes Quick response to the lightweight Post composer", () => {
    render(<ResponseStartLink postId="parent-post-id" />);
    fireEvent.click(screen.getByRole("button", { name: "Write a response" }));

    const quick = screen.getByRole("link", { name: /^Quick response/ });
    expect(quick).toHaveAttribute("href", "/create/post?inResponseTo=parent-post-id");
  });

  it("routes Long-form response to the existing Article composer, unchanged", () => {
    render(<ResponseStartLink postId="parent-post-id" />);
    fireEvent.click(screen.getByRole("button", { name: "Write a response" }));

    const longForm = screen.getByRole("link", { name: /^Long-form response/ });
    expect(longForm).toHaveAttribute(
      "href",
      "/write?inResponseTo=parent-post-id&kind=article"
    );
  });

  it("closes on Escape without navigating or writing anything", () => {
    render(<ResponseStartLink postId="parent-post-id" />);
    const trigger = screen.getByRole("button", { name: "Write a response" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on backdrop click with no side effects", () => {
    render(<ResponseStartLink postId="parent-post-id" />);
    fireEvent.click(screen.getByRole("button", { name: "Write a response" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("dialog").previousSibling as Element);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes via the explicit close button with no side effects", () => {
    render(<ResponseStartLink postId="parent-post-id" />);
    fireEvent.click(screen.getByRole("button", { name: "Write a response" }));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("supports a custom trigger label and className", () => {
    render(
      <ResponseStartLink postId="parent-post-id" className="my-class">
        Start writing
      </ResponseStartLink>
    );

    const trigger = screen.getByRole("button", { name: "Start writing" });
    expect(trigger).toHaveClass("my-class");
  });

  it("fires an optional onTriggerClick alongside opening the chooser, for a caller's own unrelated tracking", () => {
    const onTriggerClick = vi.fn();
    render(<ResponseStartLink postId="parent-post-id" onTriggerClick={onTriggerClick} />);

    fireEvent.click(screen.getByRole("button", { name: "Write a response" }));

    expect(onTriggerClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("ResponseStartLink -- starter/responseIntent bypasses the chooser (existing long-form behavior, unchanged)", () => {
  afterEach(() => cleanup());

  it("builds a kind=article link straight to the Article composer when a starter is declared", () => {
    render(<ResponseStartLink postId="titleless-post-id" starter="response" />);

    const link = screen.getByRole("link", { name: "Write a response" });
    expect(link).toHaveAttribute(
      "href",
      "/write?inResponseTo=titleless-post-id&kind=article&starter=response"
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("builds a kind=article link straight to the Article composer when a responseIntent is declared", () => {
    render(<ResponseStartLink postId="post-2" responseIntent="challenge" />);

    const link = screen.getByRole("link", { name: "Write a response" });
    expect(link).toHaveAttribute(
      "href",
      "/write?inResponseTo=post-2&kind=article&responseIntent=challenge"
    );
  });

  it("includes starter/responseIntent params together without dropping kind=article", () => {
    render(
      <ResponseStartLink postId="post-2" starter="response" responseIntent="challenge" />
    );

    const link = screen.getByRole("link", { name: "Write a response" });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("kind=article");
    expect(href).toContain("inResponseTo=post-2");
    expect(href).toContain("starter=response");
    expect(href).toContain("responseIntent=challenge");
  });

  it("still fires onTriggerClick on the direct-Link (bypass) branch", () => {
    const onTriggerClick = vi.fn();
    render(
      <ResponseStartLink
        postId="post-2"
        starter="response"
        onTriggerClick={onTriggerClick}
      />
    );

    fireEvent.click(screen.getByRole("link", { name: "Write a response" }));

    expect(onTriggerClick).toHaveBeenCalledTimes(1);
  });
});
