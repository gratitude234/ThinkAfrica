import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Segment membership at Resend.
 *
 * The bug these exist for was invisible from Supabase: the sync recorded
 * segment_keys = [], sync_error = null and reported success, while Resend went
 * on listing preview.lane03.1781075745@example.com in "Indegenius: All
 * eligible users". The cause was an assumption about POST /contacts, so the
 * fake below reproduces what that endpoint actually does rather than what the
 * old code hoped it did: it is an upsert, it answers 201 for a contact that
 * already exists, and its `segments` field only ever adds.
 */

type FakeContact = {
  id: string;
  email: string;
  unsubscribed: boolean;
  segments: string[];
};

const { fake } = vi.hoisted(() => ({
  fake: {
    contacts: [] as FakeContact[],
    calls: [] as { op: string; contactId?: string; segmentId?: string }[],
    listPageSize: 100,
  },
}));

function findContact(email: string) {
  return fake.contacts.find((contact) => contact.email === email) ?? null;
}

const client = {
  contacts: {
    /**
     * Resend's real upsert. An existing contact is not an error: it answers
     * 201 with the id, adds any segments passed, and removes nothing. Passing
     * an empty list is therefore a no-op, which is the whole defect.
     */
    create: vi.fn(async (payload: { email: string; segments?: { id: string }[] }) => {
      fake.calls.push({ op: "contacts.create" });
      const existing = findContact(payload.email);
      const added = (payload.segments ?? []).map((segment) => segment.id);

      if (existing) {
        for (const id of added) {
          if (!existing.segments.includes(id)) existing.segments.push(id);
        }
        return { data: { id: existing.id, object: "contact" }, error: null };
      }

      const contact: FakeContact = {
        id: `contact-${fake.contacts.length + 1}`,
        email: payload.email,
        unsubscribed: false,
        segments: [...added],
      };
      fake.contacts.push(contact);
      return { data: { id: contact.id, object: "contact" }, error: null };
    }),
    get: vi.fn(async ({ email }: { email: string }) => {
      fake.calls.push({ op: "contacts.get" });
      const contact = findContact(email);
      if (!contact) {
        return { data: null, error: { name: "not_found", message: "No contact." } };
      }
      return { data: { ...contact }, error: null };
    }),
    update: vi.fn(async ({ id, unsubscribed }: { id: string; unsubscribed: boolean }) => {
      fake.calls.push({ op: "contacts.update", contactId: id });
      const contact = fake.contacts.find((entry) => entry.id === id);
      if (contact) contact.unsubscribed = unsubscribed;
      return { data: { id, object: "contact" }, error: null };
    }),
    segments: {
      list: vi.fn(
        async ({
          contactId,
          after,
        }: {
          contactId: string;
          limit?: number;
          after?: string;
        }) => {
          fake.calls.push({ op: "contacts.segments.list", contactId });
          const contact = fake.contacts.find((entry) => entry.id === contactId);
          const all = (contact?.segments ?? []).map((id) => ({
            id,
            name: id,
            created_at: "2026-09-01T00:00:00Z",
          }));
          const start = after
            ? all.findIndex((segment) => segment.id === after) + 1
            : 0;
          const page = all.slice(start, start + fake.listPageSize);
          return {
            data: {
              object: "list",
              data: page,
              has_more: start + page.length < all.length,
            },
            error: null,
          };
        }
      ),
      add: vi.fn(
        async ({ contactId, segmentId }: { contactId: string; segmentId: string }) => {
          fake.calls.push({ op: "contacts.segments.add", contactId, segmentId });
          const contact = fake.contacts.find((entry) => entry.id === contactId);
          if (contact && !contact.segments.includes(segmentId)) {
            contact.segments.push(segmentId);
          }
          return { data: { id: segmentId }, error: null };
        }
      ),
      remove: vi.fn(
        async ({ contactId, segmentId }: { contactId: string; segmentId: string }) => {
          fake.calls.push({ op: "contacts.segments.remove", contactId, segmentId });
          const contact = fake.contacts.find((entry) => entry.id === contactId);
          if (contact) {
            contact.segments = contact.segments.filter((id) => id !== segmentId);
          }
          return { data: { id: segmentId, deleted: true }, error: null };
        }
      ),
    },
  },
};

vi.mock("@/lib/resendClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/resendClient")>(
    "@/lib/resendClient"
  );
  return { ...actual, requireResendClient: () => client };
});

const { syncContactSegments } = await import("@/lib/resendBroadcasts");

/** The five standing segments the sync manages, as ids. */
const MANAGED = ["seg-all", "seg-active", "seg-authors", "seg-verified", "seg-new"];

function removals() {
  return fake.calls.filter((call) => call.op === "contacts.segments.remove");
}

function additions() {
  return fake.calls.filter((call) => call.op === "contacts.segments.add");
}

beforeEach(() => {
  fake.contacts = [];
  fake.calls = [];
  fake.listPageSize = 100;
  vi.clearAllMocks();
});

describe("taking a contact out of a segment", () => {
  it("issues a real removal call when the desired set empties", async () => {
    // The exact production case. old = ['all'], desired = [].
    fake.contacts.push({
      id: "contact-1",
      email: "preview.lane03.1781075745@example.com",
      unsubscribed: false,
      segments: ["seg-all"],
    });

    await syncContactSegments({
      email: "preview.lane03.1781075745@example.com",
      segmentIds: [],
      managedSegmentIds: MANAGED,
    });

    // Not merely POST /contacts { segments: [] }, which is what used to happen
    // and what left the contact in the segment.
    expect(removals()).toEqual([
      {
        op: "contacts.segments.remove",
        contactId: "contact-1",
        segmentId: "seg-all",
      },
    ]);
    expect(findContact("preview.lane03.1781075745@example.com")?.segments).toEqual(
      []
    );
  });

  it("does not stop at the upsert just because it answered without an error", async () => {
    // POST /contacts answers 201 for an existing contact. Treating that as
    // "done" is precisely what skipped every add and remove below it.
    fake.contacts.push({
      id: "contact-1",
      email: "member@indegenius.africa",
      unsubscribed: false,
      segments: ["seg-all", "seg-active"],
    });

    await syncContactSegments({
      email: "member@indegenius.africa",
      segmentIds: [],
      managedSegmentIds: MANAGED,
    });

    expect(client.contacts.create).toHaveBeenCalled();
    expect(client.contacts.segments.list).toHaveBeenCalled();
    expect(removals().map((call) => call.segmentId).sort()).toEqual([
      "seg-active",
      "seg-all",
    ]);
  });

  it("removes every managed segment a fully ineligible contact was in", async () => {
    fake.contacts.push({
      id: "contact-1",
      email: "member@indegenius.africa",
      unsubscribed: false,
      segments: [...MANAGED],
    });

    await syncContactSegments({
      email: "member@indegenius.africa",
      segmentIds: [],
      managedSegmentIds: MANAGED,
    });

    expect(removals()).toHaveLength(MANAGED.length);
    expect(findContact("member@indegenius.africa")?.segments).toEqual([]);
  });

  it("never touches a segment it was not told it manages", async () => {
    // A segment somebody built by hand in the Resend dashboard has to survive
    // a sync that is emptying every audience this contact belonged to.
    fake.contacts.push({
      id: "contact-1",
      email: "member@indegenius.africa",
      unsubscribed: false,
      segments: ["seg-all", "someone-elses-segment"],
    });

    await syncContactSegments({
      email: "member@indegenius.africa",
      segmentIds: [],
      managedSegmentIds: MANAGED,
    });

    expect(removals().map((call) => call.segmentId)).toEqual(["seg-all"]);
    expect(findContact("member@indegenius.africa")?.segments).toEqual([
      "someone-elses-segment",
    ]);
  });
});

describe("putting a contact into a segment", () => {
  it("adds the memberships that are missing and removes the ones that went", async () => {
    fake.contacts.push({
      id: "contact-1",
      email: "member@indegenius.africa",
      unsubscribed: false,
      segments: ["seg-all", "seg-new"],
    });

    await syncContactSegments({
      email: "member@indegenius.africa",
      segmentIds: ["seg-all", "seg-authors"],
      managedSegmentIds: MANAGED,
    });

    expect(findContact("member@indegenius.africa")?.segments.sort()).toEqual([
      "seg-all",
      "seg-authors",
    ]);
    expect(removals().map((call) => call.segmentId)).toEqual(["seg-new"]);
  });

  it("issues no membership calls when the contact is already right", async () => {
    fake.contacts.push({
      id: "contact-1",
      email: "member@indegenius.africa",
      unsubscribed: false,
      segments: ["seg-all"],
    });

    await syncContactSegments({
      email: "member@indegenius.africa",
      segmentIds: ["seg-all"],
      managedSegmentIds: MANAGED,
    });

    expect(additions()).toHaveLength(0);
    expect(removals()).toHaveLength(0);
  });

  it("creates a contact that does not exist yet with its segments", async () => {
    await syncContactSegments({
      email: "newcomer@indegenius.africa",
      segmentIds: ["seg-all", "seg-new"],
      managedSegmentIds: MANAGED,
    });

    expect(findContact("newcomer@indegenius.africa")?.segments.sort()).toEqual([
      "seg-all",
      "seg-new",
    ]);
    expect(removals()).toHaveLength(0);
  });

  it("reads every page before deciding what is missing", async () => {
    // Stopping at the first page would read a membership as absent, and then
    // fail to remove one that is sitting on the second.
    fake.listPageSize = 2;
    fake.contacts.push({
      id: "contact-1",
      email: "member@indegenius.africa",
      unsubscribed: false,
      segments: [...MANAGED],
    });

    await syncContactSegments({
      email: "member@indegenius.africa",
      segmentIds: ["seg-all"],
      managedSegmentIds: MANAGED,
    });

    expect(removals()).toHaveLength(4);
    expect(findContact("member@indegenius.africa")?.segments).toEqual(["seg-all"]);
  });
});

describe("failure and consent", () => {
  it("throws when a removal fails, so nothing is stamped as synced", async () => {
    fake.contacts.push({
      id: "contact-1",
      email: "member@indegenius.africa",
      unsubscribed: false,
      segments: ["seg-all"],
    });
    client.contacts.segments.remove.mockResolvedValueOnce({
      data: null,
      error: { name: "application_error", message: "Segment is locked." },
    } as never);

    await expect(
      syncContactSegments({
        email: "member@indegenius.africa",
        segmentIds: [],
        managedSegmentIds: MANAGED,
      })
    ).rejects.toThrow(/contacts.segments.remove/);
  });

  it("lifts the provider unsubscribe only when a re-opt-in is pending", async () => {
    fake.contacts.push({
      id: "contact-1",
      email: "member@indegenius.africa",
      unsubscribed: true,
      segments: [],
    });

    await syncContactSegments({
      email: "member@indegenius.africa",
      segmentIds: ["seg-all"],
      managedSegmentIds: MANAGED,
    });
    expect(client.contacts.update).not.toHaveBeenCalled();

    await syncContactSegments({
      email: "member@indegenius.africa",
      segmentIds: ["seg-all"],
      managedSegmentIds: MANAGED,
      resubscribe: true,
    });
    expect(client.contacts.update).toHaveBeenCalledWith({
      id: "contact-1",
      unsubscribed: false,
    });
  });
});
