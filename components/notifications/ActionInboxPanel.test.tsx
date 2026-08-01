import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ActionInboxPanel from "./ActionInboxPanel";
import { getActionInboxSummary } from "@/lib/actionInbox";

vi.mock("@/lib/activationEvents", () => ({ trackActivationEvent: vi.fn() }));

const createdAt = "2026-07-30T09:00:00.000Z";

function notification(type: string, overrides: Record<string, unknown> = {}) {
  return {
    id: type,
    type,
    read: false,
    created_at: createdAt,
    message: `A ${type} happened`,
    ...overrides,
  };
}

function renderPanel(types: string[]) {
  return render(
    <ActionInboxPanel
      summary={getActionInboxSummary(types.map((type) => notification(type)))}
      source="dashboard_action_inbox"
    />
  );
}

describe("Needs attention panel", () => {
  it("stays hidden when nothing actually needs attention", () => {
    // Regression: this headlined the newest unread row of any kind, so a single
    // new follower rendered as "Needs attention: New follower" with a primary CTA.
    const { container } = renderPanel(["follow", "like", "author_published"]);

    expect(container).toBeEmptyDOMElement();
  });

  it("headlines the highest-priority actionable item", () => {
    renderPanel(["like", "follow", "review_assigned", "revision_requested"]);

    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Revision requested" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Revise submission" })
    ).toBeInTheDocument();
  });

  it("keeps passive activity out of the secondary cards too", () => {
    // The cards sit under the same "Needs attention" heading, so a row of likes
    // beneath an actionable headline is the same over-claim one level down.
    renderPanel(["revision_requested", "review_assigned", "follow", "like"]);

    expect(screen.getByText("Review assigned")).toBeInTheDocument();
    expect(screen.queryByText("New follower")).not.toBeInTheDocument();
    expect(screen.queryByText("New like")).not.toBeInTheDocument();
  });

  it("falls back to a link when the headline is the only action", () => {
    renderPanel(["revision_requested", "follow"]);

    expect(
      screen.getByRole("link", { name: "View all notifications" })
    ).toBeInTheDocument();
  });

  it("ignores actionable items that have already been read", () => {
    const { container } = render(
      <ActionInboxPanel
        summary={getActionInboxSummary([
          notification("revision_requested", { read: true }),
          notification("follow"),
        ])}
        source="dashboard_action_inbox"
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("still surfaces the stale-unread nudge", () => {
    render(
      <ActionInboxPanel
        summary={getActionInboxSummary([
          notification("revision_requested", {
            created_at: "2026-06-01T09:00:00.000Z",
          }),
        ])}
        source="dashboard_action_inbox"
      />
    );

    expect(screen.getByText(/1 unread item older than 7 days/)).toBeInTheDocument();
  });
});
