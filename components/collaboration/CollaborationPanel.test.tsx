import type { AnchorHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
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

vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: vi.fn() }),
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
    responseHref: "/write?inResponseTo=post-1",
    responsesHref: "#responses",
    ...overrides,
  };
}

describe("CollaborationPanel 'Write a response' CTA (Pass 3: Response Creation UX)", () => {
  it("links straight to the universal composer with parent context", () => {
    render(<CollaborationPanel summary={baseSummary()} authorName="Jane" />);

    expect(screen.getByRole("link", { name: "Write a response" })).toHaveAttribute(
      "href",
      "/write?inResponseTo=post-1"
    );
  });

  it("does not render a mode chooser", () => {
    render(<CollaborationPanel summary={baseSummary()} authorName="Jane" />);

    expect(screen.queryByRole("dialog", { name: "Respond" })).not.toBeInTheDocument();
  });
});
