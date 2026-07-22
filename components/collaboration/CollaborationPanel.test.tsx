import type { AnchorHTMLAttributes } from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CollaborationPanel from "./CollaborationPanel";
import type { CollaborationSummary } from "@/lib/collaboration";

vi.mock("next/navigation", () => ({
  usePathname: () => "/post/some-post",
  useRouter: () => ({ push: vi.fn() }),
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

function baseSummary(overrides: Partial<CollaborationSummary> = {}): CollaborationSummary {
  return {
    postId: "post-1",
    postSlug: "some-post",
    authorId: "author-1",
    viewerId: "viewer-1",
    responseCount: 0,
    coauthorCount: 0,
    isOwnPost: false,
    isFollowingAuthor: false,
    canFollow: true,
    canMessage: false,
    messageReason: null,
    signInHref: "/login?redirectTo=/post/some-post",
    responseHref: "/write?inResponseTo=post-1&kind=article",
    responsesHref: "#responses",
    ...overrides,
  };
}

describe("CollaborationPanel 'Write a response' CTA (Pass 3: Response Creation UX)", () => {
  it("opens the shared response chooser instead of linking straight to the Article composer", () => {
    render(<CollaborationPanel summary={baseSummary()} authorName="Jane" />);

    const trigger = screen.getByRole("button", { name: "Write a response" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Respond" });
    const links = within(dialog).getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAccessibleName(/^Quick response/);
    expect(links[1]).toHaveAccessibleName(/^Long-form response/);
    expect(links[0]).toHaveAttribute("href", expect.stringContaining("inResponseTo=post-1"));
  });

  it("does not render a plain link straight to /write", () => {
    render(<CollaborationPanel summary={baseSummary()} authorName="Jane" />);

    expect(screen.queryByRole("link", { name: "Write a response" })).not.toBeInTheDocument();
  });
});
