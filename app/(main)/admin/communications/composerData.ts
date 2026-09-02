import "server-only";

import { buildBroadcastSenderOptions, defaultSenderKey } from "@/lib/broadcasts";
import {
  getAudienceCounts,
  listSegmentStates,
  listSelectableRecipients,
  standingSegmentsStale,
} from "@/lib/broadcastStore";
import type { AdminContext } from "@/lib/adminAccess";

/**
 * Everything the composer needs that only the server can answer, loaded once
 * for both the new-broadcast route and the edit route so the two cannot drift.
 *
 * Senders are resolved here, where the sending domain is known, and filtered by
 * capability before they ever reach the browser. The composer cannot offer an
 * identity this admin is not entitled to use, and the send action re-checks it
 * regardless of what the browser sends back.
 */
export async function loadComposerData(context: AdminContext) {
  const senderOptions = buildBroadcastSenderOptions(context.capabilities);
  const initialSenderKey = defaultSenderKey(senderOptions);

  if (!initialSenderKey) return null;

  const [audienceCounts, selectableRecipients, segments] = await Promise.all([
    getAudienceCounts(),
    listSelectableRecipients(),
    listSegmentStates(),
  ]);

  return {
    senderOptions,
    initialSenderKey,
    defaultTestRecipient: context.email ?? "",
    audienceCounts,
    selectableRecipients,
    // Any standing audience that has never synced makes the whole set stale.
    // Taking the oldest date present would quietly skip the audience that was
    // never built at all, which is the one most worth warning about.
    recipientsStale: standingSegmentsStale(segments, new Date()),
  };
}

export type ComposerData = NonNullable<Awaited<ReturnType<typeof loadComposerData>>>;
