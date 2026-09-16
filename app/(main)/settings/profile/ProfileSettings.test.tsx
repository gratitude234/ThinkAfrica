import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileSettingsModel } from "@/lib/profileSettings";
import ProfileSettings from "./ProfileSettings";

const saveProfileSection = vi.hoisted(() => vi.fn());
const saveTopicsSection = vi.hoisted(() => vi.fn());
const saveVisibilitySection = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({
  saveProfileSection,
  saveTopicsSection,
  saveVisibilitySection,
}));

vi.mock("@/app/(main)/settings/profileActions", () => ({
  saveProfileMedia: vi.fn().mockResolvedValue({ ok: true, data: null }),
}));

// Both upload or search against real services; neither is what these tests
// are about.
vi.mock("@/app/(main)/settings/AvatarUploader", () => ({ default: () => null }));
vi.mock("@/components/ui/UniversitySelect", () => ({
  default: ({ value }: { value: string }) => (
    <input aria-label="University search" readOnly value={value} />
  ),
}));

const trackActivationEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/activationEvents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/activationEvents")>()),
  trackActivationEvent,
}));

const model: ProfileSettingsModel = {
  id: "user-1",
  username: "ada",
  fullName: "Ada Nwosu",
  avatarUrl: null,
  headline: "Policy researcher",
  bio: "A biography.",
  country: "Nigeria",
  university: "",
  fieldOfStudy: "",
  graduationYear: "",
  interests: ["Education"],
  visibility: { profileVisibility: "public", showInDirectory: true },
};

const setup = () => userEvent.setup({ delay: null });

function section(name: string) {
  return screen.getByRole("heading", { name, level: 2 }).closest("section") as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  saveProfileSection.mockResolvedValue({ ok: true, username: "ada" });
  saveTopicsSection.mockResolvedValue({ ok: true });
  saveVisibilitySection.mockResolvedValue({ ok: true });
});

describe("Edit profile", () => {
  it("is Profile, Topics and Visibility, and nothing else", () => {
    render(<ProfileSettings model={model} />);

    expect(screen.getByRole("heading", { name: "Edit profile", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View profile" })).toHaveAttribute("href", "/ada");
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)
    ).toEqual(["Profile", "Topics", "Visibility"]);
  });

  it("asks for no persona, focus statement, organisation, cover, featured work or completion", () => {
    const { container } = render(<ProfileSettings model={model} />);
    const text = container.textContent ?? "";

    for (const retired of [
      /Profile type/i,
      /Intellectual focus/i,
      /Organi[sz]ation/i,
      /Cover photo/i,
      /Featured Work/i,
      /Intellectual Record/i,
      /Demonstrated topics/i,
      /% complete/i,
      /Complete your profile/i,
      /Preview/,
    ]) {
      expect(text).not.toMatch(retired);
    }
  });

  it("offers the headline, location and education as optional fields", () => {
    render(<ProfileSettings model={model} />);
    const profile = section("Profile");

    for (const label of ["Name", "Username", "Headline", "Bio", "Location", "Field of study", "Graduation year"]) {
      expect(within(profile).getByLabelText(new RegExp(`^${label}`))).toBeInTheDocument();
    }
  });
});

describe("section save states", () => {
  it("moves from idle to dirty to saved", async () => {
    const user = setup();
    render(<ProfileSettings model={model} />);
    const profile = section("Profile");

    expect(within(profile).queryByText("Unsaved changes.")).not.toBeInTheDocument();

    await user.type(within(profile).getByLabelText(/^Bio/), "!");
    expect(within(profile).getByText("Unsaved changes.")).toBeInTheDocument();

    await user.click(within(profile).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(within(profile).getByText("Saved.")).toBeInTheDocument());
    expect(saveProfileSection).toHaveBeenCalledWith(
      expect.objectContaining({ bio: "A biography.!", headline: "Policy researcher" })
    );
  });

  it("keeps the draft and shows the error when a save fails", async () => {
    saveProfileSection.mockResolvedValue({ ok: false, error: "Database unavailable." });
    const user = setup();
    render(<ProfileSettings model={model} />);
    const profile = section("Profile");

    const bio = within(profile).getByLabelText(/^Bio/) as HTMLTextAreaElement;
    await user.clear(bio);
    await user.type(bio, "A revised biography.");
    await user.click(within(profile).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(within(profile).getByText("Database unavailable.")).toBeInTheDocument()
    );
    expect(bio.value).toBe("A revised biography.");
  });

  it("reports the save outcome after persistence, not on click", async () => {
    const user = setup();
    render(<ProfileSettings model={model} />);
    const profile = section("Profile");

    await user.type(within(profile).getByLabelText(/^Bio/), "!");
    expect(
      trackActivationEvent.mock.calls.filter(([payload]) => payload.event === "profile_section_saved")
    ).toHaveLength(0);

    await user.click(within(profile).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      const call = trackActivationEvent.mock.calls.find(
        ([payload]) => payload.event === "profile_section_saved"
      );
      expect(call?.[0].metadata).toEqual({
        profileId: "user-1",
        section: "profile",
        outcome: "success",
      });
    });
  });

  it("blocks a save while the username is not usable", async () => {
    const user = setup();
    render(<ProfileSettings model={model} />);
    const profile = section("Profile");

    const username = within(profile).getByLabelText(/^Username/);
    // "settings" is a reserved path, so it can never be a profile URL.
    await user.clear(username);
    await user.type(username, "settings");

    expect(within(profile).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(within(profile).getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it("saves topics on their own", async () => {
    const user = setup();
    render(<ProfileSettings model={model} />);
    const topics = section("Topics");

    await user.click(within(topics).getByRole("button", { name: "Public Health" }));
    await user.click(within(topics).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveTopicsSection).toHaveBeenCalledWith({
        interests: ["Education", "Public Health"],
      })
    );
    expect(saveProfileSection).not.toHaveBeenCalled();
  });
});
