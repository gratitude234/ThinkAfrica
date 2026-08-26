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
  it("keeps the five conversion steps, in order, at the head of the list", () => {
    // Phase 3 added recognition and brief events to the same funnel. The
    // original five stay first and unchanged, because the conversion rates in
    // docs/profile-conversion-funnel.md are computed from them.
    expect([...PROFILE_FUNNEL_EVENTS].slice(0, 5)).toEqual([
      "profile_viewed",
      "profile_work_opened",
      "profile_follow_completed",
      "profile_inquiry_opened",
      "profile_inquiry_submitted",
    ]);
  });

  it("names the surfaces a funnel step can start from", () => {
    expect([...PROFILE_FUNNEL_SURFACES].slice(0, 5)).toEqual([
      "profile_header",
      "featured_work",
      "latest_record",
      "full_record",
      "sticky_bar",
    ]);
    // Phase 3 surfaces are additive.
    expect([...PROFILE_FUNNEL_SURFACES]).toContain("recognition");
    expect([...PROFILE_FUNNEL_SURFACES]).toContain("demonstrated_expertise");
    expect([...PROFILE_FUNNEL_SURFACES]).toContain("profile_brief");
  });

  it("registers every event with the server, or the row is never written", () => {
    for (const event of PROFILE_FUNNEL_EVENTS) {
      expect(activationEvents).toContain(`| "${event}"`);
      expect(activationRoute).toContain(`"${event}",`);
    }
  });

  it("dedupes the view event rather than the actions", () => {
    // Views repeat on every remount of the same page; a follow or an inquiry
    // is a discrete act and must never be swallowed by a dedupe window.
    const viewEvents = activationEvents.slice(
      activationEvents.indexOf("const VIEW_EVENTS")
    );
    const viewSet = viewEvents.slice(0, viewEvents.indexOf("]);"));
    expect(viewSet).toContain('"profile_viewed"');
    expect(viewSet).not.toContain('"profile_follow_completed"');
    expect(viewSet).not.toContain('"profile_inquiry_submitted"');
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
        surface: "latest_record",
        workId: "post-9",
        workKind: "publication",
      })
    ).toEqual({
      profileId: "author-1",
      viewerState: "authenticated",
      surface: "latest_record",
      workId: "post-9",
      workKind: "publication",
    });
  });

  it("omits an absent optional property rather than sending a null", () => {
    const metadata = buildProfileFunnelMetadata({
      event: "profile_follow_completed",
      profileId: "author-1",
      viewerState: "authenticated",
      surface: "sticky_bar",
      workId: null,
      workKind: null,
    });

    expect(metadata).not.toHaveProperty("workId");
    expect(metadata).not.toHaveProperty("workKind");
  });

  it("never carries a name, an email, a bio, or anything an author wrote", () => {
    const metadata = buildProfileFunnelMetadata({
      event: "profile_inquiry_submitted",
      profileId: "author-1",
      viewerState: "authenticated",
      surface: "profile_header",
      workId: "post-9",
      workKind: "research",
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
