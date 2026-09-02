import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireCapability } from "@/lib/adminAccess";
import { AdminAccessError } from "@/lib/supabase/admin";
import { isBroadcastEditable } from "@/lib/broadcasts";
import { getBroadcastRecord } from "@/lib/broadcastStore";
import { PrototypeNotice } from "../../CommunicationsChrome";
import { loadComposerData } from "../../composerData";
import BroadcastComposer from "../../new/BroadcastComposer";

/**
 * Reopening a saved draft.
 *
 * The composer autosaves from the first keystroke, so an unfinished broadcast
 * is a real row rather than something living in a tab. This is the way back to
 * it. Anything that has been claimed for sending is redirected to its record
 * instead: the copy that went to Resend is the copy of record, and offering an
 * editor for it would imply an edit could still reach a recipient.
 */
export default async function EditBroadcastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let context: Awaited<ReturnType<typeof requireCapability>>;

  try {
    context = await requireCapability("communications.manage");
  } catch (error) {
    if (error instanceof AdminAccessError && error.status === 401) {
      redirect("/login");
    }
    return (
      <div className="mx-auto max-w-2xl py-20 text-center text-sm text-gray-500">
        You do not have permission to send Indegenius communications.
      </div>
    );
  }

  const { id } = await params;
  const broadcast = await getBroadcastRecord(id);
  if (!broadcast) notFound();

  if (!isBroadcastEditable(broadcast.status)) {
    redirect(`/admin/communications/${id}`);
  }

  const data = await loadComposerData(context);

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <p className="text-sm text-gray-500">
          No sending identity is available to your account.
        </p>
        <Link
          href="/admin/communications"
          className="mt-4 inline-flex text-sm font-semibold text-emerald-brand hover:underline"
        >
          Back to Email Broadcasts
        </Link>
      </div>
    );
  }

  // An admin who may open the draft is not necessarily entitled to the
  // identity it was written under. The dropdown marks that identity restricted,
  // and the send action refuses it, so the draft opens read-with-a-locked-sender
  // rather than either disappearing or being silently re-pointed.
  return (
    <div className="space-y-5">
      <PrototypeNotice />
      <BroadcastComposer
        {...data}
        draft={{
          id: broadcast.id,
          subject: broadcast.subject,
          previewText: broadcast.previewText,
          bodyHtml: broadcast.bodyHtml,
          senderKey: broadcast.senderKey,
          audienceKey: broadcast.audienceKey,
          selectedProfileIds: broadcast.selectedProfileIds,
          statusNote: broadcast.statusNote,
        }}
      />
    </div>
  );
}
