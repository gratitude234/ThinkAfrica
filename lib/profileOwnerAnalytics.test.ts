import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const trackActivationEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/activationEvents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/activationEvents")>()),
  trackActivationEvent,
}));

const {
  trackCommandCenterViewed,
  trackFeatureNoteSaved,
  trackNextActionClicked,
  trackPreviewOpened,
  trackSectionSaved,
} = await import("./profileOwnerAnalytics");

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const activationRoute = read("app/api/activation/route.ts");
const activationEvents = read("lib/activationEvents.ts");
const sectionSave = read("app/(main)/settings/profile/useSectionSave.ts");

const OWNER_EVENTS = [
  "profile_command_center_viewed",
  "profile_section_saved",
  "profile_preview_opened",
  "profile_next_action_clicked",
  "profile_feature_note_saved",
];

describe("owner analytics registration", () => {
  it("registers every owner event with the client and the server", () => {
    for (const event of OWNER_EVENTS) {
      expect(activationEvents).toContain(`| "${event}"`);
      expect(activationRoute).toContain(`"${event}",`);
    }
  });

  it("dedupes the command centre view but not the actions", () => {
    const viewSet = activationEvents.slice(
      activationEvents.indexOf("const VIEW_EVENTS"),
      activationEvents.indexOf("function hashActivationKey")
    );
    expect(viewSet).toContain('"profile_command_center_viewed"');
    expect(viewSet).not.toContain('"profile_section_saved"');
    expect(viewSet).not.toContain('"profile_feature_note_saved"');
  });
});

describe("owner analytics payloads", () => {
  beforeEach(() => trackActivationEvent.mockClear());

  it("reports a command centre view by section", () => {
    trackCommandCenterViewed({ profileId: "user-1", section: "overview" });
    expect(trackActivationEvent).toHaveBeenCalledWith({
      event: "profile_command_center_viewed",
      source: "command_center",
      metadata: { profileId: "user-1", section: "overview" },
    });
  });

  it("reports a section save with its outcome", () => {
    trackSectionSaved({ section: "identity", profileId: "user-1", outcome: "success" });
    trackSectionSaved({ section: "focus", profileId: "user-1", outcome: "failure" });
    expect(trackActivationEvent.mock.calls[0][0].metadata).toEqual({
      profileId: "user-1",
      section: "identity",
      outcome: "success",
    });
    expect(trackActivationEvent.mock.calls[1][0].metadata.outcome).toBe("failure");
  });

  it("reports which preview surface opened and whether it held unsaved work", () => {
    trackPreviewOpened({
      profileId: "user-1",
      surface: "mobile_sheet",
      hasUnsavedChanges: true,
    });
    expect(trackActivationEvent.mock.calls[0][0].metadata).toEqual({
      profileId: "user-1",
      surface: "mobile_sheet",
      hasUnsavedChanges: true,
    });
  });

  it("reports the action key and its rank, never its copy", () => {
    trackNextActionClicked({
      profileId: "user-1",
      actionKey: "select_featured",
      surface: "dashboard",
      rank: "primary",
    });
    const metadata = trackActivationEvent.mock.calls[0][0].metadata;
    expect(metadata).toEqual({
      profileId: "user-1",
      actionKey: "select_featured",
      surface: "dashboard",
      rank: "primary",
    });
  });

  it("counts feature notes rather than sending what they say", () => {
    trackFeatureNoteSaved({ profileId: "user-1", selectionCount: 3, noteCount: 2 });
    const metadata = trackActivationEvent.mock.calls[0][0].metadata;
    expect(metadata).toEqual({
      profileId: "user-1",
      selectionCount: 3,
      noteCount: 2,
    });
    expect(Object.keys(metadata)).not.toContain("note");
    expect(Object.keys(metadata)).not.toContain("text");
  });

  it("never carries author-written text on any owner event", () => {
    trackCommandCenterViewed({ profileId: "user-1", section: "focus" });
    trackSectionSaved({ section: "focus", profileId: "user-1", outcome: "success" });
    trackPreviewOpened({
      profileId: "user-1",
      surface: "desktop_rail",
      hasUnsavedChanges: false,
    });
    trackFeatureNoteSaved({ profileId: "user-1", selectionCount: 1, noteCount: 1 });

    const forbidden = [
      "fullName",
      "full_name",
      "bio",
      "positioningStatement",
      "positioning_statement",
      "email",
      "note",
      "headline",
      "overview",
      "skills",
    ];
    for (const [payload] of trackActivationEvent.mock.calls) {
      for (const key of Object.keys(payload.metadata ?? {})) {
        expect(forbidden).not.toContain(key);
      }
    }
  });
});

describe("save timing", () => {
  it("reports a section save only after persistence returns", () => {
    // The event fires inside the branch that inspects the server's result,
    // never in the click handler that starts the request.
    expect(sectionSave).toMatch(
      /if \(!result\.ok\)[\s\S]{0,320}trackSectionSaved\(\{ section, profileId, outcome: "failure" \}\)/
    );
    expect(sectionSave).toMatch(
      /setStatus\("saved"\);\s*\n\s*trackSectionSaved\(\{ section, profileId, outcome: "success" \}\)/
    );
  });

  it("refuses a duplicate submission while a save is in flight", () => {
    expect(sectionSave).toContain("if (inFlight.current) return;");
  });
});
