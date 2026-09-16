import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildProfileFunnelMetadata,
  getProfileViewerState,
  PROFILE_FUNNEL_EVENTS,
  PROFILE_FUNNEL_SURFACES,
} from "./profileFunnel";

const activationRoute = readFileSync(
  resolve(process.cwd(), "app/api/activation/route.ts"),
  "utf8"
);
const activationEvents = readFileSync(
  resolve(process.cwd(), "lib/activationEvents.ts"),
  "utf8"
);

describe("profile funnel event contract", () => {
  it("keeps the three conversion steps, in order, at the head of the list", () => {
    // The conversion rates in docs/profile-conversion-funnel.md are computed
    // from these three. Phase 2D removed the opportunity inquiry steps and
    // Phase 2G the recognition, expertise and brief events.
    expect([...PROFILE_FUNNEL_EVENTS]).toEqual([
      "profile_viewed",
      "profile_work_opened",
      "profile_follow_completed",
    ]);
    expect(PROFILE_FUNNEL_EVENTS as readonly string[]).not.toContain("profile_inquiry_opened");
    expect(PROFILE_FUNNEL_EVENTS as readonly string[]).not.toContain("profile_inquiry_submitted");
  });

  it("names the surfaces a funnel step can start from", () => {
    expect([...PROFILE_FUNNEL_SURFACES]).toEqual([
      "profile_header",
      "profile_posts",
      "profile_articles",
    ]);
  });

  it("registers every event with the server, or the row is never written", () => {
    for (const event of PROFILE_FUNNEL_EVENTS) {
      expect(activationEvents).toContain(`| "${event}"`);
      expect(activationRoute).toContain(`"${event}",`);
    }
  });

  it("dedupes the view event rather than the actions", () => {
    // Views repeat on every remount of the same page; a follow is a discrete
    // act and must never be swallowed by a dedupe window.
    const viewEvents = activationEvents.slice(
      activationEvents.indexOf("const VIEW_EVENTS")
    );
    const viewSet = viewEvents.slice(0, viewEvents.indexOf("]);"));
    expect(viewSet).toContain('"profile_viewed"');
    expect(viewSet).not.toContain('"profile_follow_completed"');
  });
});

describe("viewer state", () => {
  it("separates anonymous, authenticated and owner", () => {
    expect(getProfileViewerState({ viewerId: null, profileId: "a" })).toBe(
      "anonymous"
    );
    expect(getProfileViewerState({ viewerId: undefined, profileId: "a" })).toBe(
      "anonymous"
    );
    expect(getProfileViewerState({ viewerId: "b", profileId: "a" })).toBe(
      "authenticated"
    );
    expect(getProfileViewerState({ viewerId: "a", profileId: "a" })).toBe("owner");
  });
});

describe("profile funnel metadata", () => {
  it("carries only the identifiers and state the funnel needs", () => {
    expect(
      buildProfileFunnelMetadata({
        event: "profile_viewed",
        profileId: "author-1",
        viewerState: "anonymous",
        surface: "profile_header",
      })
    ).toEqual({
      profileId: "author-1",
      viewerState: "anonymous",
      surface: "profile_header",
    });
  });

  it("adds work identity only where a work was opened", () => {
    expect(
      buildProfileFunnelMetadata({
        event: "profile_work_opened",
        profileId: "author-1",
        viewerState: "authenticated",
        surface: "profile_posts",
        workId: "post-9",
        workKind: "post",
      })
    ).toEqual({
      profileId: "author-1",
      viewerState: "authenticated",
      surface: "profile_posts",
      workId: "post-9",
      workKind: "post",
    });
  });

  it("omits an absent optional property rather than sending a null", () => {
    const metadata = buildProfileFunnelMetadata({
      event: "profile_follow_completed",
      profileId: "author-1",
      viewerState: "authenticated",
      surface: "profile_header",
      workId: null,
      workKind: null,
    });

    expect(metadata).not.toHaveProperty("workId");
    expect(metadata).not.toHaveProperty("workKind");
  });

  it("never carries a name, an email, a bio, or anything an author wrote", () => {
    const metadata = buildProfileFunnelMetadata({
      event: "profile_work_opened",
      profileId: "author-1",
      viewerState: "authenticated",
      surface: "profile_header",
      workId: "post-9",
      workKind: "article",
    });

    expect(Object.keys(metadata).sort()).toEqual([
      "profileId",
      "surface",
      "viewerState",
      "workId",
      "workKind",
    ]);
  });

  it("does not carry its own timestamp, which activation_events already owns", () => {
    const metadata = buildProfileFunnelMetadata({
      event: "profile_viewed",
      profileId: "author-1",
      viewerState: "owner",
    });

    expect(Object.keys(metadata)).not.toContain("timestamp");
    expect(Object.keys(metadata)).not.toContain("at");
  });
});
