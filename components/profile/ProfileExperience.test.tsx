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
  it("places recent work before the record and keeps activity expandable", () => {
    const articles = profileFixturePage("article").items;
    const posts = profileFixturePage("post").items;
    render(<ProfileOverview data={{ profile: PROFILE_FIXTURE,
      viewer: { viewerId: null, isOwnProfile: false, isFollowing: false, isBlocked: false, followerCount: 1, followingCount: 2 },
      tab: "overview", overview: { selectedWork: null, recentWork: [...articles, ...posts], articleCount: 2, postCount: 2, totalPublished: 4, activity: [
        { month: "2025-11", count: 1 }, { month: "2025-12", count: 0 },
        { month: "2026-01", count: 2 }, { month: "2026-02", count: 1 },
        { month: "2026-03", count: 3 }, { month: "2026-04", count: 2 },
        { month: "2026-05", count: 4 }, { month: "2026-06", count: 3 },
        { month: "2026-07", count: 5 }, { month: "2026-08", count: 4 },
        { month: "2026-09", count: 6 }, { month: "2026-10", count: 2 },
      ], writingTopics: [
        { key: "politics & governance", count: 3 },
        { key: "education policy", count: 2 },
      ], relatedThinkers: [] }, publications: null, drafts: null }} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map(node => node.textContent)).toEqual(["Recent Work", "Intellectual Record", "About", "Writes about", "Interests"]);
    expect(screen.getByText("Published work built on Indegenius.")).toBeInTheDocument();
    const activity = screen.getByText("View activity").closest("details")!;
    expect(activity.open).toBe(false);
    expect(screen.getByRole("heading", { name: "Last 12 months", level: 3, hidden: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Published works by month")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Posts" })).toHaveAttribute("href", "/amara?view=posts");
    expect(screen.getByRole("link", { name: "View full record" })).toHaveAttribute("href", "/amara/record");
    expect(screen.getByRole("link", { name: "Politics & Governance" })).toHaveAttribute("href", "/topics/politics%20%26%20governance");
  });

  it("places an author-selected published work before the Intellectual Record", () => {
    const selected = profileFixturePage("article").items[0];
    render(<ProfileOverview data={{ profile: PROFILE_FIXTURE,
      viewer: { viewerId: null, isOwnProfile: false, isFollowing: false, isBlocked: false, followerCount: 1, followingCount: 2 },
      tab: "overview", overview: { selectedWork: selected, recentWork: [], articleCount: 2, postCount: 2, totalPublished: 4, activity: [
        { month: "2025-11", count: 1 }, { month: "2025-12", count: 0 },
        { month: "2026-01", count: 2 }, { month: "2026-02", count: 1 },
        { month: "2026-03", count: 3 }, { month: "2026-04", count: 2 },
        { month: "2026-05", count: 4 }, { month: "2026-06", count: 3 },
        { month: "2026-07", count: 5 }, { month: "2026-08", count: 4 },
        { month: "2026-09", count: 6 }, { month: "2026-10", count: 2 },
      ], writingTopics: [], relatedThinkers: [] }, publications: null, drafts: null }} />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map(node => node.textContent);
    expect(headings[0]).toBe(selected.title);
    expect(headings[1]).toBe("Recent Work");
    expect(headings[2]).toBe("Intellectual Record");
  });

  it("gives a zero-work owner one clear publishing state instead of empty modules", () => {
    render(<ProfileOverview data={{ profile: PROFILE_FIXTURE,
      viewer: { viewerId: PROFILE_FIXTURE.id, isOwnProfile: true, isFollowing: false, isBlocked: false, followerCount: 0, followingCount: 0 },
      tab: "overview", overview: { selectedWork: null, recentWork: [], articleCount: 0, postCount: 0, totalPublished: 0, activity: [], writingTopics: [], relatedThinkers: [] }, publications: null, drafts: null }} />);
    expect(screen.getByRole("heading", { name: "Build your intellectual record" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Write a Post" })).toHaveAttribute("href", "/write");
    expect(screen.getByRole("link", { name: "Write an Article" })).toHaveAttribute("href", "/write?editor=article");
    expect(screen.queryByRole("heading", { name: "Intellectual Record" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recent Work" })).not.toBeInTheDocument();
  });

  it("gives a zero-work visitor a quiet state without owner actions", () => {
    render(<ProfileOverview data={{ profile: PROFILE_FIXTURE,
      viewer: { viewerId: null, isOwnProfile: false, isFollowing: false, isBlocked: false, followerCount: 0, followingCount: 0 },
      tab: "overview", overview: { selectedWork: null, recentWork: [], articleCount: 0, postCount: 0, totalPublished: 0, activity: [], writingTopics: [], relatedThinkers: [] }, publications: null, drafts: null }} />);
    expect(screen.getByRole("heading", { name: "No published work yet" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Write a Post" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Write an Article" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("tab", { name: "Posts" })).toHaveFocus();
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
