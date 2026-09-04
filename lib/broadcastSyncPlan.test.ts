import { describe, expect, it } from "vitest";
import {
  countSegmentMembership,
  planContactSync,
  type ContactSnapshot,
  type StoredContact,
} from "@/lib/broadcastSyncPlan";

/**
 * The plan is the whole reason a nightly run costs a few hundred Resend calls
 * instead of twelve thousand, and the reason a first run can be interrupted
 * and picked up again. Both properties are worth holding onto.
 */

function snapshot(overrides: Partial<ContactSnapshot> = {}): ContactSnapshot {
  return {
    profileId: "p1",
    email: "member@example.com",
    isEligible: true,
    segmentKeys: ["all"],
    lastActivityAt: null,
    publishedCount: 0,
    isVerified: false,
    profileCreatedAt: "2025-01-01T00:00:00Z",
    unsubscribed: false,
    ...overrides,
  };
}

function stored(overrides: Partial<StoredContact> = {}): StoredContact {
  return {
    ...snapshot(),
    syncedAt: "2026-09-01T00:00:00Z",
    resubscribedAt: null,
    ...overrides,
  };
}

function storedMap(...contacts: StoredContact[]) {
  return new Map(contacts.map((contact) => [contact.profileId, contact]));
}

describe("what needs doing", () => {
  it("does nothing at all for a contact that has not changed", () => {
    const plan = planContactSync([snapshot()], storedMap(stored()));

    expect(plan.upserts).toEqual([]);
    expect(plan.resendPushes).toEqual([]);
  });

  it("pushes a contact it has never seen", () => {
    const plan = planContactSync([snapshot()], storedMap());

    expect(plan.upserts).toHaveLength(1);
    expect(plan.resendPushes).toHaveLength(1);
  });

  it("pushes a contact stored but never actually synced to Resend", () => {
    // The bootstrap case: a first run writes every row, then pushes as many as
    // the time budget allows. Everything still holding a null synced_at is the
    // front of the next run's queue.
    const plan = planContactSync([snapshot()], storedMap(stored({ syncedAt: null })));

    expect(plan.resendPushes).toHaveLength(1);
  });

  it("pushes when the address moved", () => {
    const plan = planContactSync(
      [snapshot({ email: "new@example.com" })],
      storedMap(stored({ email: "old@example.com" }))
    );

    expect(plan.resendPushes).toHaveLength(1);
  });

  it("pushes when the audiences changed", () => {
    const plan = planContactSync(
      [snapshot({ segmentKeys: ["all", "authors"] })],
      storedMap(stored({ segmentKeys: ["all"] }))
    );

    expect(plan.resendPushes).toHaveLength(1);
  });

  it("ignores the order of the audience list", () => {
    const plan = planContactSync(
      [snapshot({ segmentKeys: ["authors", "all"] })],
      storedMap(stored({ segmentKeys: ["all", "authors"] }))
    );

    expect(plan.resendPushes).toEqual([]);
  });

  it("writes derived state back without a Resend call when only counts moved", () => {
    // A published count that ticked up does not change which segments somebody
    // is in unless it crossed zero, so it is a Supabase write and nothing more.
    const plan = planContactSync(
      [snapshot({ publishedCount: 4, segmentKeys: ["all", "authors"] })],
      storedMap(stored({ publishedCount: 3, segmentKeys: ["all", "authors"] }))
    );

    expect(plan.upserts).toHaveLength(1);
    expect(plan.resendPushes).toEqual([]);
  });

  it("pushes somebody who became ineligible with no segments, which removes them", () => {
    const plan = planContactSync(
      [snapshot({ isEligible: false, segmentKeys: [], unsubscribed: true })],
      storedMap(stored())
    );

    expect(plan.resendPushes).toHaveLength(1);
    expect(plan.resendPushes[0].segmentKeys).toEqual([]);
  });

  it("keeps asking until a push has actually landed at Resend", () => {
    // stored.segmentKeys is what Resend is known to have, not what we want it
    // to have. The sync used to write the desired set to it before the push,
    // which erased the only difference the next run had to work from: a push
    // that then failed left the contact looking permanently synced, and the
    // removal never happened.
    const becameIneligible = snapshot({ isEligible: false, segmentKeys: [] });
    const lastPushed = stored({ segmentKeys: ["all"] });

    const plan = planContactSync([becameIneligible], storedMap(lastPushed));

    expect(plan.resendPushes).toHaveLength(1);
    expect(plan.resendPushes[0].segmentKeys).toEqual([]);
  });

  it("serves the longest-waiting contacts first", () => {
    // A run that exhausts its budget must leave the freshest contacts waiting
    // rather than starving the ones that have waited longest.
    const plan = planContactSync(
      [
        snapshot({ profileId: "recent", email: "a@x.com", segmentKeys: ["all", "new"] }),
        snapshot({ profileId: "never", email: "b@x.com", segmentKeys: ["all", "new"] }),
        snapshot({ profileId: "old", email: "c@x.com", segmentKeys: ["all", "new"] }),
      ],
      storedMap(
        stored({ profileId: "recent", email: "a@x.com", syncedAt: "2026-09-01T00:00:00Z" }),
        stored({ profileId: "never", email: "b@x.com", syncedAt: null }),
        stored({ profileId: "old", email: "c@x.com", syncedAt: "2026-01-01T00:00:00Z" })
      )
    );

    expect(plan.resendPushes.map((push) => push.profileId)).toEqual([
      "never",
      "old",
      "recent",
    ]);
  });
});

describe("re-opting in after an unsubscribe", () => {
  it("pushes a resubscribe when the member turned the category back on", () => {
    // The profiles trigger clears synced_at and stamps resubscribed_at, so a
    // pending re-opt-in is exactly "resubscribed but not yet pushed".
    const plan = planContactSync(
      [snapshot()],
      storedMap(
        stored({
          unsubscribed: true,
          segmentKeys: [],
          isEligible: false,
          syncedAt: null,
          resubscribedAt: "2026-09-02T09:00:00Z",
        })
      )
    );

    expect(plan.resendPushes).toHaveLength(1);
    expect(plan.resendPushes[0].resubscribe).toBe(true);
  });

  it("stops asking once the resubscribe has been pushed", () => {
    const plan = planContactSync(
      [snapshot()],
      storedMap(
        stored({
          resubscribedAt: "2026-09-02T09:00:00Z",
          syncedAt: "2026-09-02T10:00:00Z",
        })
      )
    );

    expect(plan.resendPushes).toEqual([]);
  });

  it("never lifts the provider flag for an ordinary push", () => {
    // Only a member's own decision inside Indegenius may undo an unsubscribe.
    // A routine segment change must not carry that power with it.
    const plan = planContactSync(
      [snapshot({ segmentKeys: ["all", "verified"] })],
      storedMap(stored({ segmentKeys: ["all"] }))
    );

    expect(plan.resendPushes).toHaveLength(1);
    expect(plan.resendPushes[0].resubscribe).toBeUndefined();
  });

  it("does not resurrect somebody who unsubscribed and never came back", () => {
    const plan = planContactSync(
      [snapshot({ isEligible: false, segmentKeys: [], unsubscribed: true })],
      storedMap(
        stored({ isEligible: false, segmentKeys: [], unsubscribed: true })
      )
    );

    expect(plan.resendPushes).toEqual([]);
    expect(plan.upserts).toEqual([]);
  });
});

describe("segment counts", () => {
  it("counts each contact once per audience it belongs to", () => {
    const counts = countSegmentMembership([
      snapshot({ profileId: "a", segmentKeys: ["all", "authors"] }),
      snapshot({ profileId: "b", segmentKeys: ["all"] }),
      snapshot({ profileId: "c", segmentKeys: ["all", "authors", "verified"] }),
    ]);

    expect(counts).toEqual({ all: 3, authors: 2, verified: 1 });
  });

  it("leaves ineligible contacts out of every count", () => {
    const counts = countSegmentMembership([
      snapshot({ profileId: "a", segmentKeys: ["all"] }),
      snapshot({ profileId: "b", isEligible: false, segmentKeys: [] }),
    ]);

    expect(counts.all).toBe(1);
  });
});
