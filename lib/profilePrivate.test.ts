import { describe, expect, it } from "vitest";
import { normalizeMyPrivateProfile } from "@/lib/profilePrivate";

const privateRow = {
  profile_id: "00000000-0000-0000-0000-000000000001",
  signup_email: "reader@example.edu",
  notification_prefs: { email_comments: false },
  privacy_settings: { profile_visibility: "members_only" },
  onboarding_completed: true,
  suspended_at: null,
  suspended_reason: null,
  last_engagement_push_notified_at: null,
  last_comment_email_notified_at: null,
  push_prompt_shown_at: "2026-01-01T00:00:00.000Z",
  push_prompt_last_shown_at: "2026-01-02T00:00:00.000Z",
  push_prompt_attempt_count: 2,
};

describe("normalizeMyPrivateProfile", () => {
  it("normalizes the TABLE-valued RPC array shape", () => {
    expect(normalizeMyPrivateProfile([privateRow])).toEqual(privateRow);
  });

  it("also accepts a single row and supplies safe optional defaults", () => {
    expect(
      normalizeMyPrivateProfile({ profile_id: privateRow.profile_id })
    ).toMatchObject({
      profile_id: privateRow.profile_id,
      signup_email: null,
      onboarding_completed: false,
      push_prompt_attempt_count: 0,
    });
  });

  it("rejects missing, empty, and malformed payloads", () => {
    expect(normalizeMyPrivateProfile(null)).toBeNull();
    expect(normalizeMyPrivateProfile([])).toBeNull();
    expect(normalizeMyPrivateProfile({ profile_id: 42 })).toBeNull();
  });
});
