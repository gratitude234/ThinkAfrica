import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfileAbout, { safeExternalProfileUrl } from "./ProfileAbout";
import ProfileDraftList from "./ProfileDraftList";
import ProfilePublicationList from "./ProfilePublicationList";
import ProfileOverview from "./ProfileOverview";
import ProfileTabs from "./ProfileTabs";
import ShareButton from "./ShareButton";
import { PROFILE_FIXTURE, PROFILE_DRAFT_FIXTURES, profileFixturePage } from "@/lib/devFixtures/profileFixtures";

const deletion = vi.hoisted(() => vi.fn());
vi.mock("@/app/(write)/write/deleteActions", () => ({ deleteOwnDraftPosts: deletion }));
vi.mock("@/lib/activationEvents", () => ({ trackActivationEvent: vi.fn() }));
beforeEach(() => { deletion.mockReset(); });

describe("approved writer profile", () => {
  it("keeps the four Overview sections in order", () => {
    render(<ProfileOverview data={{ profile: PROFILE_FIXTURE,
      viewer: { viewerId: null, isOwnProfile: false, isFollowing: false, isBlocked: false, followerCount: 1, followingCount: 2 },
      tab: "overview", overview: { articles: profileFixturePage("article"), posts: profileFixturePage("post") }, publications: null, drafts: null }} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map(node => node.textContent)).toEqual(["Recent articles", "Recent posts", "Writes about", "At a glance"]);
    expect(screen.queryByText("Current role")).not.toBeInTheDocument();
  });
  it("never renders a Post title, even when a legacy row has one", () => {
    const page = profileFixturePage("post"); page.items[0].title = "Legacy title must stay hidden";
    render(<ProfilePublicationList username="amara" profileId="fixture" tab="posts" publications={page} isOwnProfile={false} viewerState="anonymous" />);
    expect(screen.queryByText("Legacy title must stay hidden")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText(page.items[0].excerpt!)).toBeInTheDocument();
  });
  it("derives Article reading time from the stored word count", () => {
    render(<ProfilePublicationList username="amara" profileId="fixture" tab="articles" publications={profileFixturePage("article")} isOwnProfile={false} viewerState="anonymous" />);
    expect(screen.getAllByText(/5 min read/)).toHaveLength(2);
  });
  it("renders available About facts and a secured external link", () => {
    render(<ProfileAbout profile={PROFILE_FIXTURE} isOwnProfile={false} />);
    expect(screen.getByRole("heading", { name: "Education" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /example.org/ })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("EXTERNAL")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Experience" })).not.toBeInTheDocument();
  });
  it("omits missing sections and unsafe links", () => {
    render(<ProfileAbout profile={{ ...PROFILE_FIXTURE, bio: null, professional_title: null, university: null,
      field_of_study: null, graduation_year: null, interests: [], organization_website: "javascript:alert(1)", created_at: "" }} isOwnProfile={false} />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it.each(["javascript:alert(1)", "data:text/html,hi", "//example.org", "https://user:pass@example.org", "garbage"])("rejects unsafe external URL %s", value => {
    expect(safeExternalProfileUrl(value)).toBeNull();
  });
  it("supports arrow, Home and End keys without selecting on focus", () => {
    render(<ProfileTabs username="amara" active="overview" isOwnProfile />);
    const overview = screen.getByRole("tab", { name: "Overview" }); overview.focus();
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "About" })).toHaveFocus();
    expect(overview).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getByRole("tab", { name: "Drafts" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(overview).toHaveFocus();
  });
});

describe("draft actions", () => {
  it("names titled, untitled Article and titleless Post drafts correctly", () => {
    render(<ProfileDraftList initialDrafts={PROFILE_DRAFT_FIXTURES} />);
    expect(screen.getByText("Untitled Article")).toBeInTheDocument();
    expect(screen.getByText("Making room for public life")).toBeInTheDocument();
    expect(screen.getByText("A note about the spaces between buildings.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Edit" })[0]).toHaveAttribute("href", "/write?draft=fixture-draft-1");
  });
  it("requires confirmation before deletion", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ProfileDraftList initialDrafts={PROFILE_DRAFT_FIXTURES} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(deletion).not.toHaveBeenCalled();
  });
  it("retains the draft and reports a failed deletion", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deletion.mockRejectedValue(new Error("offline"));
    render(<ProfileDraftList initialDrafts={PROFILE_DRAFT_FIXTURES} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete");
    expect(screen.getByText("Making room for public life")).toBeInTheDocument();
  });
  it("removes only server-confirmed deletions", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deletion.mockResolvedValue({ ok: true, data: { deleted: ["fixture-draft-1"] } });
    render(<ProfileDraftList initialDrafts={PROFILE_DRAFT_FIXTURES} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(screen.queryByText("Making room for public life")).not.toBeInTheDocument();
    expect(screen.getByText("Untitled Article")).toBeInTheDocument();
  });
  it("offers Start writing for an empty draft list", () => {
    render(<ProfileDraftList initialDrafts={[]} />);
    expect(screen.getByText("No drafts yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start writing" })).toHaveAttribute("href", "/write");
  });
});

describe("sharing", () => {
  it("copies the canonical profile URL without private tab state", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    window.history.replaceState({}, "", "/amara?view=drafts");
    render(<ShareButton label="Copy profile link" copyOnly />);
    fireEvent.click(screen.getByRole("button", { name: "Copy profile link" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/amara`);
    expect(await screen.findByText("Profile URL copied")).toBeInTheDocument();
  });
});
