import "server-only";

import {
  requireResendClient,
  unwrapResend,
  resendApiError,
  ResendApiError,
} from "@/lib/resendClient";
import type { BroadcastAudienceKey } from "@/lib/broadcasts";

/**
 * The Resend side of broadcasting.
 *
 * Resend's model is segments of contacts, and a broadcast addressed to one
 * segment. We keep our own copy of who should be in each segment and push
 * differences up; Resend keeps the unsubscribe link and tells us who left.
 *
 * Note on naming: the SDK deprecated `audienceId` in favour of `segmentId`
 * throughout, so nothing here uses audiences even though our own audiences
 * share the word.
 *
 * Two rules about other people's data at Resend. Nothing here ever deletes a
 * segment or a contact, and membership is only ever removed from segments we
 * are explicitly told we manage. A segment somebody builds by hand in the
 * Resend dashboard is invisible to this file.
 */

/** The segment names as they appear in the Resend dashboard. */
export const SEGMENT_NAMES: Record<string, string> = {
  all: "Indegenius: All eligible users",
  active: "Indegenius: Active users",
  authors: "Indegenius: Authors",
  verified: "Indegenius: Verified users",
  new: "Indegenius: New users",
};

/** Named so a hand-picked send is recognisable in the Resend dashboard. */
export function selectedSegmentName(broadcastId: string) {
  return `Indegenius: Broadcast ${broadcastId.slice(0, 8)}`;
}

export type ResendContactSummary = {
  id: string;
  email: string;
  unsubscribed: boolean;
};

/**
 * Confirms a segment id we already hold still exists. Cheaper and safer than
 * searching by name: somebody renaming the segment in the Resend dashboard
 * would otherwise make the next sync create a duplicate beside it.
 */
async function segmentExists(segmentId: string) {
  const resend = requireResendClient();
  const result = await resend.segments.get(segmentId);
  if (result.error) {
    // A missing segment is an answer, not a failure. Anything else is real.
    if (
      typeof result.error === "object" &&
      result.error !== null &&
      "name" in result.error &&
      (result.error as { name: unknown }).name === "not_found"
    ) {
      return false;
    }
    throw resendApiError("segments.get", result.error);
  }
  return Boolean(result.data);
}

/**
 * Finds the segment, creating it only if it is genuinely absent. Called on
 * every sync run, so it must never make a second segment with the same name
 * after a partial failure.
 *
 * `knownId` is what we recorded last time. Trusting it first is what keeps a
 * routine run at one call instead of paging the whole segment list.
 */
export async function ensureSegment(
  audienceKey: BroadcastAudienceKey,
  knownId: string | null = null
) {
  const resend = requireResendClient();
  const name = SEGMENT_NAMES[audienceKey];
  if (!name) {
    throw new Error(`No managed Resend segment for audience: ${audienceKey}`);
  }

  if (knownId && (await segmentExists(knownId))) {
    return { id: knownId, created: false };
  }

  let cursor: string | undefined;
  do {
    const page = unwrapResend(
      "segments.list",
      await resend.segments.list({ limit: 100, after: cursor })
    );

    const match = page.data.find((segment) => segment.name === name);
    if (match) return { id: match.id, created: false };

    cursor = page.has_more ? page.data[page.data.length - 1]?.id : undefined;
  } while (cursor);

  const created = unwrapResend(
    "segments.create",
    await resend.segments.create({ name })
  );

  return { id: created.id, created: true };
}

/** Creates a segment by name, or returns the existing one with that name. */
export async function ensureNamedSegment(name: string) {
  const resend = requireResendClient();

  let cursor: string | undefined;
  do {
    const page = unwrapResend(
      "segments.list",
      await resend.segments.list({ limit: 100, after: cursor })
    );
    const match = page.data.find((segment) => segment.name === name);
    if (match) return { id: match.id, created: false };
    cursor = page.has_more ? page.data[page.data.length - 1]?.id : undefined;
  } while (cursor);

  const created = unwrapResend(
    "segments.create",
    await resend.segments.create({ name })
  );
  return { id: created.id, created: true };
}

/**
 * The managed segments this contact is currently in at Resend, read from
 * GET /contacts/{id}/segments and filtered to the ones we manage.
 *
 * Paged, because a contact can be in more segments than one page holds: the
 * five standing audiences plus a hand-picked segment for every broadcast they
 * were ever named in. Stopping at the first page would read a membership as
 * absent and then "add" it, or worse, fail to see one that needs removing.
 */
async function listManagedMemberships(
  contactId: string,
  managed: ReadonlySet<string>
) {
  const resend = requireResendClient();
  const memberships = new Set<string>();
  let after: string | undefined;

  for (;;) {
    const page = unwrapResend(
      "contacts.segments.list",
      await resend.contacts.segments.list({ contactId, limit: 100, after })
    );

    for (const segment of page.data) {
      if (managed.has(segment.id)) memberships.add(segment.id);
    }

    const last = page.data[page.data.length - 1];
    if (!page.has_more || !last) break;
    after = last.id;
  }

  return memberships;
}

/**
 * Puts a contact in exactly the managed segments given, and out of the managed
 * segments not given. Segments we do not manage are left alone, so a segment
 * someone builds by hand in the Resend dashboard survives our sync.
 *
 * Membership is changed one call at a time, through
 * POST/DELETE /contacts/{id}/segments/{segmentId}, because Resend has no
 * operation that replaces a contact's memberships wholesale. In particular
 * POST /contacts is an upsert whose `segments` field only ever adds: it
 * answers 201 for a contact that already exists, and passing an empty list
 * removes nothing. Using it as a replacement is what left an opted-out contact
 * sitting in "Indegenius: All eligible users" while our own row said the
 * segments were empty and the sync reported success. So create is only ever
 * used to make the contact exist; what it belongs to is settled below.
 *
 * Every add and every remove is awaited and unwrapped, so a single failed call
 * throws. The caller stamps synced_at and segment_keys only on a clean return,
 * which is what keeps "we said it is in no segments" and "Resend has it in no
 * segments" the same statement.
 *
 * `resubscribe` lifts Resend's own unsubscribed flag. It is only ever passed
 * for somebody who turned the category back on inside Indegenius themselves,
 * which is the one signal that outranks an opt-out we mirrored from Resend.
 */
export async function syncContactSegments(input: {
  email: string;
  firstName?: string | null;
  segmentIds: string[];
  managedSegmentIds: string[];
  resubscribe?: boolean;
}) {
  const resend = requireResendClient();
  const email = input.email.trim().toLowerCase();
  const managed = new Set(input.managedSegmentIds);
  const desired = new Set(input.segmentIds);

  // Upsert, purely to guarantee the contact exists and to carry the name. The
  // segments passed here are an optimisation for a contact that really is new;
  // for one that already exists they add and never remove, which is why the
  // reconcile below runs either way rather than being skipped on a 201.
  const created = await resend.contacts.create({
    email,
    firstName: input.firstName ?? undefined,
    segments: input.segmentIds.map((id) => ({ id })),
  });

  let contactId = created.error ? null : (created.data?.id ?? null);

  // The create response carries an id and nothing else, so the contact is only
  // read when the id is missing or when the unsubscribed flag is needed.
  if (!contactId || input.resubscribe) {
    const existing = await resend.contacts.get({ email });
    if (existing.error || !existing.data) {
      throw resendApiError("contacts.create", created.error ?? existing.error);
    }

    contactId = existing.data.id;

    if (input.resubscribe && existing.data.unsubscribed) {
      unwrapResend(
        "contacts.update",
        await resend.contacts.update({ id: contactId, unsubscribed: false })
      );
    }
  }

  const currentManaged = await listManagedMemberships(contactId, managed);

  for (const segmentId of desired) {
    if (!currentManaged.has(segmentId)) {
      unwrapResend(
        "contacts.segments.add",
        await resend.contacts.segments.add({ contactId, segmentId })
      );
    }
  }

  // Only ever a segment we manage and no longer want. A contact who has become
  // ineligible reaches here with an empty desired set, so this is the loop that
  // actually takes them out of every standing audience.
  for (const segmentId of currentManaged) {
    if (!desired.has(segmentId)) {
      unwrapResend(
        "contacts.segments.remove",
        await resend.contacts.segments.remove({ contactId, segmentId })
      );
    }
  }

  return { id: contactId };
}

export type SegmentContactPage = {
  contacts: ResendContactSummary[];
  /** Pass back as `after` to continue. Null when the segment is exhausted. */
  nextCursor: string | null;
};

/**
 * One page of a segment's contacts. Paged explicitly rather than as a
 * generator because the unsubscribe mirror has to be able to stop mid-segment
 * and record where it stopped: a full pass over twelve thousand contacts is
 * a hundred and twenty list calls and does not fit in one run.
 */
export async function listSegmentContactsPage(
  segmentId: string,
  after?: string
): Promise<SegmentContactPage> {
  const resend = requireResendClient();
  const page = unwrapResend(
    "contacts.list",
    await resend.contacts.list({ segmentId, limit: 100, after })
  );

  const contacts = page.data.map((contact) => ({
    id: contact.id,
    email: contact.email,
    unsubscribed: contact.unsubscribed,
  }));

  return {
    contacts,
    nextCursor:
      page.has_more && contacts.length > 0
        ? contacts[contacts.length - 1].id
        : null,
  };
}

export type CreateResendBroadcastInput = {
  name: string;
  segmentId: string;
  from: string;
  replyTo?: string;
  subject: string;
  previewText?: string;
  html: string;
  text: string;
};

/**
 * Creates the broadcast as a draft and returns its id. Deliberately separate
 * from sending: the id is written to our row in between, so a retry that comes
 * back after a timeout sends the draft that already exists rather than making
 * a second one.
 *
 * `send` is left unset, which is what keeps it a draft. Passing send:true here
 * would collapse the two calls into one and take the retry safety with it.
 */
export async function createResendBroadcast(input: CreateResendBroadcastInput) {
  const resend = requireResendClient();

  const created = unwrapResend(
    "broadcasts.create",
    await resend.broadcasts.create({
      name: input.name,
      segmentId: input.segmentId,
      from: input.from,
      replyTo: input.replyTo ? [input.replyTo] : undefined,
      subject: input.subject,
      previewText: input.previewText || undefined,
      html: input.html,
      text: input.text,
    })
  );

  return { id: created.id };
}

export async function sendResendBroadcast(resendBroadcastId: string) {
  const resend = requireResendClient();
  unwrapResend("broadcasts.send", await resend.broadcasts.send(resendBroadcastId));
}

/** Resend's own view of a broadcast: draft, queued or sent. */
export async function getResendBroadcast(resendBroadcastId: string) {
  const resend = requireResendClient();
  const result = await resend.broadcasts.get(resendBroadcastId);

  if (result.error) {
    const error = resendApiError("broadcasts.get", result.error);
    if (error.code === "not_found") return null;
    throw error;
  }

  return result.data;
}

export { ResendApiError };
