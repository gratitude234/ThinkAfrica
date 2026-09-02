import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/adminAccess";
import { AdminAccessError } from "@/lib/supabase/admin";
import { getEmailSender } from "@/lib/emailSenders";
import {
  formatBroadcastDate,
  formatRecipientCount,
  getBroadcastAudience,
  isBroadcastEditable,
  type BroadcastRecord,
} from "@/lib/broadcasts";
import { listBroadcasts } from "@/lib/broadcastStore";
import BroadcastStatusPill from "./BroadcastStatusPill";
import {
  CommunicationsHeader,
  CommunicationsTabs,
  PrototypeNotice,
} from "./CommunicationsChrome";

function broadcastMetaLine(broadcast: BroadcastRecord) {
  if (broadcast.status === "draft") {
    return `Edited ${formatBroadcastDate(broadcast.updatedAt)}`;
  }

  const recipients = `${formatRecipientCount(broadcast.recipientCount)} recipients`;
  const date = formatBroadcastDate(broadcast.sentAt ?? broadcast.updatedAt);

  if (broadcast.status === "queued") return `${recipients} · Queued ${date}`;
  if (broadcast.status === "sending") return `${recipients} · Started ${date}`;
  if (broadcast.status === "failed") return `${recipients} · Attempted ${date}`;
  return `${recipients} · Sent ${date}`;
}

function BroadcastRow({ broadcast }: { broadcast: BroadcastRecord }) {
  const sender = getEmailSender(broadcast.senderKey);
  const audience = getBroadcastAudience(broadcast.audienceKey);
  // A draft opens where the work continues. Everything else opens its record.
  const href = isBroadcastEditable(broadcast.status)
    ? `/admin/communications/${broadcast.id}/edit`
    : `/admin/communications/${broadcast.id}`;

  return (
    <Link
      href={href}
      className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-canvas sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold leading-6 text-ink">
          {broadcast.subject}
        </p>
        <p className="mt-1 truncate text-xs leading-5 text-gray-500">
          {sender.name} · {audience.label}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-gray-400">
          {broadcastMetaLine(broadcast)}
        </p>
      </div>
      <BroadcastStatusPill status={broadcast.status} />
    </Link>
  );
}

function BroadcastSection({
  title,
  note,
  broadcasts,
  emptyLabel,
}: {
  title: string;
  note?: string;
  broadcasts: BroadcastRecord[];
  emptyLabel: string;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {note ? <p className="text-xs text-gray-400">{note}</p> : null}
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {broadcasts.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">
            {emptyLabel}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {broadcasts.map((broadcast) => (
              <li key={broadcast.id}>
                <BroadcastRow broadcast={broadcast} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default async function AdminCommunicationsPage() {
  try {
    await requireCapability("communications.manage");
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

  const broadcasts = await listBroadcasts();
  const drafts = broadcasts.filter((broadcast) => broadcast.status === "draft");
  const sent = broadcasts.filter((broadcast) => broadcast.status !== "draft");

  return (
    <div className="space-y-8">
      <PrototypeNotice />

      <CommunicationsHeader
        title="Email Broadcasts"
        description="Write to the Indegenius community. One message, from one approved identity, to one audience you confirm before it goes."
        action={
          <Link
            href="/admin/communications/new"
            className="inline-flex items-center rounded-lg bg-emerald-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37]"
          >
            Create broadcast
          </Link>
        }
      />

      <CommunicationsTabs active="broadcasts" />

      {drafts.length > 0 ? (
        <BroadcastSection
          title="Drafts"
          note={`${drafts.length} in progress`}
          broadcasts={drafts}
          emptyLabel="No drafts."
        />
      ) : null}

      <BroadcastSection
        title="Recent broadcasts"
        broadcasts={sent}
        emptyLabel="Nothing has been broadcast yet."
      />
    </div>
  );
}
