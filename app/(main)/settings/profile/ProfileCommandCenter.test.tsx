import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfileCommandCenter from "./ProfileCommandCenter";
import { withNextAction, type ProfileCommandCenterModel } from "@/lib/profileCommandCenter";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/settings/profile",
  useSearchParams: () => new URLSearchParams(),
}));

const saveFeaturedWorkSection = vi.hoisted(() => vi.fn());
const saveFocusSection = vi.hoisted(() => vi.fn());
const saveIdentitySection = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({
  saveFeaturedWorkSection,
  saveFocusSection,
  saveIdentitySection,
  saveTopicsSection: vi.fn().mockResolvedValue({ ok: true }),
  saveBackgroundSection: vi.fn().mockResolvedValue({ ok: true }),
  saveVisibilitySection: vi.fn().mockResolvedValue({ ok: true }),
  saveOpportunitiesSection: vi.fn().mockResolvedValue({ ok: true }),
  saveResearchSection: vi.fn().mockResolvedValue({ ok: true }),
}));

const trackActivationEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/activationEvents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/activationEvents")>()),
  trackActivationEvent,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({ update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
  }),
}));

function baseModel(
  overrides: Partial<Omit<ProfileCommandCenterModel, "nextAction">> = {}
): ProfileCommandCenterModel {
  return withNextAction({
    identity: {
      id: "user-1",
      username: "ada",
      fullName: "Ada Nwosu",
      avatarUrl: null,
      coverImageUrl: null,
      profileType: "professional",
      secondaryProfileTypes: [],
      verified: false,
      verifiedType: null,
      isAlumni: false,
    },
    focus: { positioningStatement: "How budgets fail.", bio: "A biography." },
    background: {
      country: "Nigeria",
      university: "",
      fieldOfStudy: "",
      graduationYear: "",
      professionalTitle: "Policy researcher",
      organizationName: "",
      organizationWebsite: "",
      openToMentoring: false,
    },
    topics: {
      interests: ["Economics"],
      demonstratedTopics: [{ key: "law", label: "Law", count: 2 }],
    },
    featured: [],
    research: {
      enabled: false,
      headline: "",
      overview: "",
      researchInterests: [],
      methods: [],
      collaborationStatus: "selective",
      preferredRoles: [],
      orcidUrl: "",
      websiteUrl: "",
    },
    opportunities: {
      talentProfileId: null,
      openToOpportunities: false,
      opportunityTypes: [],
      skills: [],
      cvUrl: "",
      linkedinUrl: "",
      visibility: "public",
    },
    visibility: {
      profileVisibility: "public",
      allowMessages: "everyone",
      showInDirectory: true,
    },
    recordSummary: {
      publicationCount: 2,
      sourceBackedCount: 1,
      citableCount: 0,
      responseCount: 0,
      debateCount: 0,
      researchCount: 0,
    },
    followerCount: 3,
    eligibleFeaturedCount: 2,
    isStudentPath: false,
    positioningEnabled: true,
    ...overrides,
  });
}

const eligibleWork = [
  { id: "p1", title: "Vaccine access in Nigeria", publishedAt: "2026-08-01T00:00:00.000Z", isCoAuthor: false },
  { id: "p2", title: "Budget audit trails", publishedAt: "2026-07-01T00:00:00.000Z", isCoAuthor: true },
];

function renderCenter(model = baseModel()) {
  return render(<ProfileCommandCenter model={model} eligibleWork={eligibleWork} />);
}

const setup = () => userEvent.setup({ delay: null });

describe("Profile Command Center shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveFeaturedWorkSection.mockResolvedValue({ ok: true });
    saveFocusSection.mockResolvedValue({ ok: true });
    saveIdentitySection.mockResolvedValue({ ok: true });
  });

  it("names itself and links to the public profile", () => {
    renderCenter();
    expect(
      screen.getByRole("heading", { name: "Manage your profile", level: 1 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View public profile" })
    ).toHaveAttribute("href", "/ada");
  });

  it("keeps account settings out of the profile workspace", () => {
    renderCenter();
    expect(screen.queryByText(/password/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /notification/i })
    ).not.toBeInTheDocument();
  });

  it("renders every profile section, and hides Research when it is off", () => {
    renderCenter();
    for (const label of [
      "Identity",
      "Intellectual focus and About",
      "Topics",
      "Featured Work",
      "Background",
      "Opportunities",
      "Visibility and contact",
    ]) {
      expect(screen.getByRole("heading", { name: label, level: 2 })).toBeInTheDocument();
    }
    expect(screen.queryByRole("heading", { name: "Research", level: 2 })).not.toBeInTheDocument();
  });

  it("shows Research once the feature is enabled", () => {
    renderCenter(
      baseModel({
        research: {
          enabled: true,
          headline: "",
          overview: "",
          researchInterests: [],
          methods: [],
          collaborationStatus: "selective",
          preferredRoles: [],
          orcidUrl: "",
          websiteUrl: "",
        },
      })
    );
    expect(screen.getByRole("heading", { name: "Research", level: 2 })).toBeInTheDocument();
  });

  it("records the command centre view once", () => {
    renderCenter();
    expect(
      trackActivationEvent.mock.calls.filter(
        ([payload]) => payload.event === "profile_command_center_viewed"
      )
    ).toHaveLength(1);
  });

  it("offers one dominant next action, derived from the shared engine", () => {
    renderCenter();
    // Two publications and nothing featured, so the engine asks for a selection.
    expect(screen.getByText("Choose your strongest work")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Select featured work" })
    ).toHaveAttribute("href", "/settings/profile#featured");
  });

  it("reports a next-action click by key", async () => {
    const user = setup();
    renderCenter();
    await user.click(screen.getByRole("link", { name: "Select featured work" }));
    const call = trackActivationEvent.mock.calls.find(
      ([payload]) => payload.event === "profile_next_action_clicked"
    );
    expect(call?.[0].metadata).toEqual({
      profileId: "user-1",
      actionKey: "select_featured",
      surface: "command_center",
      rank: "primary",
    });
  });
});

describe("section save states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveFocusSection.mockResolvedValue({ ok: true });
  });

  it("moves from idle to dirty to saved", async () => {
    const user = setup();
    renderCenter();
    const focus = screen.getByRole("heading", { name: "Intellectual focus and About", level: 2 })
      .closest("section") as HTMLElement;

    expect(within(focus).queryByText("Unsaved changes.")).not.toBeInTheDocument();

    await user.type(within(focus).getByLabelText(/About/), "!");
    expect(within(focus).getByText("Unsaved changes.")).toBeInTheDocument();

    await user.click(within(focus).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(within(focus).getByText("Saved.")).toBeInTheDocument()
    );
  });

  it("keeps the draft and shows the error when a save fails", async () => {
    saveFocusSection.mockResolvedValue({ ok: false, error: "Database unavailable." });
    const user = setup();
    renderCenter();
    const focus = screen.getByRole("heading", { name: "Intellectual focus and About", level: 2 })
      .closest("section") as HTMLElement;

    const bio = within(focus).getByLabelText(/About/) as HTMLTextAreaElement;
    await user.clear(bio);
    await user.type(bio, "A revised biography.");
    await user.click(within(focus).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(within(focus).getByText("Database unavailable.")).toBeInTheDocument()
    );
    // The typed value survives the failure.
    expect(bio.value).toBe("A revised biography.");
  });

  it("reports the save outcome after persistence, not on click", async () => {
    const user = setup();
    renderCenter();
    const focus = screen.getByRole("heading", { name: "Intellectual focus and About", level: 2 })
      .closest("section") as HTMLElement;

    await user.type(within(focus).getByLabelText(/About/), "!");
    expect(
      trackActivationEvent.mock.calls.filter(
        ([payload]) => payload.event === "profile_section_saved"
      )
    ).toHaveLength(0);

    await user.click(within(focus).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      const call = trackActivationEvent.mock.calls.find(
        ([payload]) => payload.event === "profile_section_saved"
      );
      expect(call?.[0].metadata).toEqual({
        profileId: "user-1",
        section: "focus",
        outcome: "success",
      });
    });
  });

  it("blocks a save while a field is invalid", async () => {
    const user = setup();
    renderCenter();
    const identity = screen.getByRole("heading", { name: "Identity", level: 2 })
      .closest("section") as HTMLElement;

    const username = within(identity).getByLabelText(/Username/);
    // "settings" is a reserved path, so it can never be a profile URL.
    await user.clear(username);
    await user.type(username, "settings");

    expect(within(identity).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(within(identity).getByRole("alert")).toBeInTheDocument();
  });
});

describe("featured work editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveFeaturedWorkSection.mockResolvedValue({ ok: true });
  });

  function featuredSection() {
    return screen
      .getByRole("heading", { name: "Featured Work", level: 2 })
      .closest("section") as HTMLElement;
  }

  it("saves selection, order and notes in one call", async () => {
    const user = setup();
    renderCenter();
    const section = featuredSection();

    await user.click(within(section).getByRole("button", { name: /Vaccine access/ }));
    await user.type(
      within(section).getByLabelText(/Why I featured this/),
      "My most complete analysis."
    );
    await user.click(within(section).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveFeaturedWorkSection).toHaveBeenCalledWith({
        selections: [{ postId: "p1", note: "My most complete analysis." }],
      })
    );
  });

  it("keeps a note with its piece when the order changes", async () => {
    const user = setup();
    renderCenter();
    const section = featuredSection();

    await user.click(within(section).getByRole("button", { name: /Vaccine access/ }));
    await user.click(within(section).getByRole("button", { name: /Budget audit/ }));

    const notes = within(section).getAllByLabelText(/Why I featured this/);
    await user.type(notes[0], "First note.");
    await user.type(notes[1], "Second note.");

    await user.click(
      within(section).getByRole("button", { name: /Move Vaccine access in Nigeria down/ })
    );
    await user.click(within(section).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveFeaturedWorkSection).toHaveBeenCalledWith({
        selections: [
          { postId: "p2", note: "Second note." },
          { postId: "p1", note: "First note." },
        ],
      })
    );
  });

  it("does not destroy a draft note when a piece is removed and added back", async () => {
    const user = setup();
    renderCenter();
    const section = featuredSection();

    await user.click(within(section).getByRole("button", { name: /Vaccine access/ }));
    await user.type(
      within(section).getByLabelText(/Why I featured this/),
      "Worth keeping."
    );
    await user.click(
      within(section).getByRole("button", { name: /Remove Vaccine access in Nigeria/ })
    );
    await user.click(within(section).getByRole("button", { name: /Vaccine access/ }));

    expect(
      (within(section).getByLabelText(/Why I featured this/) as HTMLTextAreaElement).value
    ).toBe("Worth keeping.");
  });

  it("refuses a fourth selection", async () => {
    const user = setup();
    render(
      <ProfileCommandCenter
        model={baseModel()}
        eligibleWork={[
          ...eligibleWork,
          { id: "p3", title: "Third piece", publishedAt: "2026-06-01T00:00:00.000Z", isCoAuthor: false },
          { id: "p4", title: "Fourth piece", publishedAt: "2026-05-01T00:00:00.000Z", isCoAuthor: false },
        ]}
      />
    );
    const section = featuredSection();

    for (const name of [/Vaccine access/, /Budget audit/, /Third piece/]) {
      await user.click(within(section).getByRole("button", { name }));
    }
    expect(within(section).getByRole("button", { name: /Fourth piece/ })).toBeDisabled();
  });

  it("blocks a save when a note is too long", async () => {
    const user = setup();
    renderCenter();
    const section = featuredSection();

    await user.click(within(section).getByRole("button", { name: /Vaccine access/ }));
    // Pasted rather than typed: 181 keystrokes is slow enough to trip the
    // test timeout, and a long note arrives by paste in real use anyway.
    await user.click(within(section).getByLabelText(/Why I featured this/));
    await user.paste("x".repeat(181));

    expect(within(section).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(saveFeaturedWorkSection).not.toHaveBeenCalled();
  });

  it("reports how many notes were saved, never what they say", async () => {
    const user = setup();
    renderCenter();
    const section = featuredSection();

    await user.click(within(section).getByRole("button", { name: /Vaccine access/ }));
    await user.click(within(section).getByRole("button", { name: /Budget audit/ }));
    await user.type(
      within(section).getAllByLabelText(/Why I featured this/)[0],
      "Explained."
    );
    await user.click(within(section).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const call = trackActivationEvent.mock.calls.find(
        ([payload]) => payload.event === "profile_feature_note_saved"
      );
      expect(call?.[0].metadata).toEqual({
        profileId: "user-1",
        selectionCount: 2,
        noteCount: 1,
      });
    });
  });

  it("says why there is nothing to select when no work is eligible", () => {
    render(<ProfileCommandCenter model={baseModel()} eligibleWork={[]} />);
    expect(
      screen.getByText(/Publish something before choosing featured work/i)
    ).toBeInTheDocument();
  });
});

describe("preview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates from the draft before anything is saved", async () => {
    const user = setup();
    renderCenter();
    const focus = screen.getByRole("heading", { name: "Intellectual focus and About", level: 2 })
      .closest("section") as HTMLElement;

    const statement = within(focus).getByLabelText(/Intellectual focus/);
    await user.clear(statement);
    await user.type(statement, "Why audits fail.");

    const previews = screen.getAllByText("Preview");
    expect(previews.length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unsaved changes").length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("Why audits fail.");
  });

  it("opens a labelled dialog on mobile and reports it", async () => {
    const user = setup();
    renderCenter();

    await user.click(screen.getByRole("button", { name: "Preview" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("heading", { name: "Preview" })).toBeInTheDocument();

    const call = trackActivationEvent.mock.calls.find(
      ([payload]) => payload.event === "profile_preview_opened"
    );
    expect(call?.[0].metadata.surface).toBe("mobile_sheet");
  });

  it("closes the mobile preview on Escape and restores focus", async () => {
    const user = setup();
    renderCenter();

    const trigger = screen.getByRole("button", { name: "Preview" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
