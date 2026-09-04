import { describe, expect, it } from "vitest";
import {
  ACTIVE_WINDOW_DAYS,
  BROADCAST_PREFERENCE_KEY,
  NEW_USER_WINDOW_DAYS,
  audienceMembership,
  broadcastIneligibleReason,
  hasUsableEmail,
  isEligibleForBroadcast,
  isReservedEmailDomain,
  matchesAudience,
  wantsBroadcastEmail,
  type BroadcastCandidate,
} from "@/lib/broadcastEligibility";

const NOW = new Date("2026-09-02T12:00:00Z");

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function candidate(
  overrides: Partial<BroadcastCandidate> = {}
): BroadcastCandidate {
  return {
    profileId: "p1",
    email: "member@indegenius.africa",
    suspendedAt: null,
    notificationPrefs: {},
    unsubscribed: false,
    lastActivityAt: null,
    publishedCount: 0,
    isVerified: false,
    profileCreatedAt: daysAgo(400),
    ...overrides,
  };
}

describe("the broadcast opt-out category", () => {
  it("is its own key, not the weekly digest", () => {
    // Muting the digest must not silently mute founder correspondence, and
    // leaving broadcasts must not cost somebody their review email.
    expect(BROADCAST_PREFERENCE_KEY).toBe("email_announcements");
  });

  it("treats an absent key as consent, matching every other email preference", () => {
    expect(wantsBroadcastEmail({})).toBe(true);
    expect(wantsBroadcastEmail(null)).toBe(true);
    expect(wantsBroadcastEmail({ email_digest: false })).toBe(true);
  });

  it("only an explicit false is an opt-out", () => {
    expect(wantsBroadcastEmail({ email_announcements: false })).toBe(false);
    expect(wantsBroadcastEmail({ email_announcements: true })).toBe(true);
  });

  it("does not read the digest preference as a broadcast opt-out", () => {
    expect(
      isEligibleForBroadcast(candidate({ notificationPrefs: { email_digest: false } }))
    ).toBe(true);
  });
});

describe("who may be written to", () => {
  it("accepts an ordinary member", () => {
    expect(broadcastIneligibleReason(candidate())).toBeNull();
  });

  it("refuses somebody with no usable address", () => {
    expect(broadcastIneligibleReason(candidate({ email: null }))).toBe("no_email");
    expect(broadcastIneligibleReason(candidate({ email: "not-an-address" }))).toBe(
      "no_email"
    );
    expect(hasUsableEmail("  member@indegenius.africa  ")).toBe(true);
  });

  it("refuses a reserved test domain, whatever the account says", () => {
    // preview.lane03.1781075745@example.com was a real row in this account,
    // and Resend rejected the whole broadcast rather than skipping it.
    expect(
      broadcastIneligibleReason(
        candidate({ email: "preview.lane03.1781075745@example.com" })
      )
    ).toBe("reserved_domain");

    for (const address of [
      "seed@example.com",
      "seed@example.org",
      "seed@example.net",
      "seed@somewhere.invalid",
      "seed@fixtures.test",
      "seed@app.localhost",
      "seed@mail.example.com",
      "SEED@EXAMPLE.COM",
    ]) {
      expect(isReservedEmailDomain(address)).toBe(true);
      expect(broadcastIneligibleReason(candidate({ email: address }))).toBe(
        "reserved_domain"
      );
    }
  });

  it("leaves ordinary addresses alone, including ones that merely read alike", () => {
    for (const address of [
      "member@indegenius.africa",
      "member@example.africa",
      "member@myexample.com",
      "member@exampleuniversity.edu.ng",
      "member@gmail.com",
    ]) {
      expect(isReservedEmailDomain(address)).toBe(false);
      expect(broadcastIneligibleReason(candidate({ email: address }))).toBeNull();
    }
  });

  it("gives a reserved address no audiences, so a sync empties its segments", () => {
    // Membership going empty is what the sync turns into a removal call at
    // Resend, which is how a cached contact actually leaves the segments.
    expect(
      audienceMembership(
        candidate({
          email: "preview@example.com",
          publishedCount: 4,
          isVerified: true,
          lastActivityAt: daysAgo(1),
        }),
        NOW
      )
    ).toEqual([]);
  });

  it("cannot be sent to by naming a reserved address by hand", () => {
    expect(
      matchesAudience(
        candidate({ email: "preview@example.com" }),
        "selected",
        ["p1"],
        NOW
      )
    ).toBe(false);
  });

  it("refuses a suspended account", () => {
    expect(
      broadcastIneligibleReason(candidate({ suspendedAt: daysAgo(1) }))
    ).toBe("suspended");
  });

  it("refuses somebody who turned the category off", () => {
    expect(
      broadcastIneligibleReason(
        candidate({ notificationPrefs: { email_announcements: false } })
      )
    ).toBe("preference_disabled");
  });

  it("refuses somebody who unsubscribed at the provider", () => {
    expect(broadcastIneligibleReason(candidate({ unsubscribed: true }))).toBe(
      "unsubscribed"
    );
  });

  it("keeps the provider opt-out authoritative over a stale local preference", () => {
    // Resend owns the unsubscribe link, so it learns first. A notification_prefs
    // blob that still says true is simply out of date.
    const person = candidate({
      unsubscribed: true,
      notificationPrefs: { email_announcements: true },
    });

    expect(isEligibleForBroadcast(person)).toBe(false);
    expect(broadcastIneligibleReason(person)).toBe("unsubscribed");
  });
});

describe("audience membership", () => {
  it("puts every eligible member in the all audience", () => {
    expect(audienceMembership(candidate(), NOW)).toEqual(["all"]);
  });

  it("gives an ineligible member no audiences at all", () => {
    const memberships = audienceMembership(
      candidate({ unsubscribed: true, publishedCount: 9, isVerified: true }),
      NOW
    );
    expect(memberships).toEqual([]);
  });

  it("counts recent activity inside the window", () => {
    expect(
      audienceMembership(
        candidate({ lastActivityAt: daysAgo(ACTIVE_WINDOW_DAYS - 1) }),
        NOW
      )
    ).toContain("active");

    expect(
      audienceMembership(
        candidate({ lastActivityAt: daysAgo(ACTIVE_WINDOW_DAYS + 1) }),
        NOW
      )
    ).not.toContain("active");
  });

  it("counts anyone with a publication as an author", () => {
    expect(audienceMembership(candidate({ publishedCount: 1 }), NOW)).toContain(
      "authors"
    );
    expect(audienceMembership(candidate({ publishedCount: 0 }), NOW)).not.toContain(
      "authors"
    );
  });

  it("counts a verified profile", () => {
    expect(audienceMembership(candidate({ isVerified: true }), NOW)).toContain(
      "verified"
    );
  });

  it("counts a recently joined member as new", () => {
    expect(
      audienceMembership(
        candidate({ profileCreatedAt: daysAgo(NEW_USER_WINDOW_DAYS - 1) }),
        NOW
      )
    ).toContain("new");
  });

  it("never includes selected, which is not a property of the member", () => {
    const memberships = audienceMembership(
      candidate({ publishedCount: 3, isVerified: true, lastActivityAt: daysAgo(1) }),
      NOW
    );
    expect(memberships).not.toContain("selected");
  });
});

describe("matching a named audience", () => {
  it("matches somebody explicitly picked", () => {
    expect(matchesAudience(candidate(), "selected", ["p1"], NOW)).toBe(true);
    expect(matchesAudience(candidate(), "selected", ["p2"], NOW)).toBe(false);
  });

  it("cannot send past an opt-out even when somebody is named by hand", () => {
    // The one rule with no override anywhere in the product.
    const person = candidate({
      notificationPrefs: { email_announcements: false },
    });

    expect(matchesAudience(person, "selected", ["p1"], NOW)).toBe(false);
  });

  it("cannot send past a provider unsubscribe when named by hand", () => {
    expect(
      matchesAudience(candidate({ unsubscribed: true }), "selected", ["p1"], NOW)
    ).toBe(false);
  });
});
