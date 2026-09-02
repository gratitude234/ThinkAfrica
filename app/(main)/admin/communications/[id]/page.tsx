import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireCapability } from "@/lib/adminAccess";
import { AdminAccessError } from "@/lib/supabase/admin";
import { getEmailSender } from "@/lib/emailSenders";
import { buildBroadcastEmailHtml } from "@/lib/broadcastEmail";
import {
  formatBroadcastDateTime,
  formatRecipientCount,
  getBroadcastAudience,
  isBroadcastEditable,
} from "@/lib/broadcasts";
import BroadcastStatusPill from "../BroadcastStatusPill";
import EmailFrame from "../EmailFrame";
import { PrototypeNotice } from "../CommunicationsChrome";
import { getBroadcastRecord } from "@/lib/broadcastStore";

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:gap-6">
      <dt className="w-40 shrink-0 text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
        {label}
      </dt>
      <dd className="min-w-0 text-sm leading-6 text-ink">{children}</dd>
    </div>
  );
}

function DeliveryStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "muted" | "warning";
}) {
  const valueTone =
    tone === "warning"
      ? "text-red-700"
      : tone === "muted"
        ? "text-gray-400"
        : "text-ink";

  return (
    <div className="px-5 py-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${valueTone}`}>
        {value}
      </p>
    </div>
  );
}

export default async function BroadcastDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const { id } = await params;
  const broadcast = await getBroadcastRecord(id);
  if (!broadcast) notFound();

  const sender = getEmailSender(broadcast.senderKey);
  const audience = getBroadcastAudience(broadcast.audienceKey);
  const attempted = broadcast.delivered + broadcast.failed;
  const isDraft = broadcast.status === "draft";
  const canEdit = isBroadcastEditable(broadcast.status);

  const timingLine = isDraft
    ? `Last edited ${formatBroadcastDateTime(broadcast.updatedAt)}`
    : broadcast.status === "queued"
      ? `Queued ${formatBroadcastDateTime(broadcast.updatedAt)} by ${broadcast.sentBy}`
      : broadcast.status === "sending"
        ? `Started ${formatBroadcastDateTime(broadcast.sentAt ?? broadcast.updatedAt)} by ${broadcast.sentBy}`
        : broadcast.status === "failed"
          ? `Attempted ${formatBroadcastDateTime(broadcast.sentAt ?? broadcast.updatedAt)} by ${broadcast.sentBy}`
          : `Sent ${formatBroadcastDateTime(broadcast.sentAt ?? broadcast.updatedAt)} by ${broadcast.sentBy}`;

  // The frame shows the merge tag inert rather than resolved. A recipient's
  // unsubscribe link is personal to them, and there is nothing here to
  // substitute it with.
  const emailHtml = buildBroadcastEmailHtml({
    subject: broadcast.subject,
    previewText: broadcast.previewText,
    bodyHtml: broadcast.bodyHtml,
    senderKey: broadcast.senderKey,
    unsubscribe: "preview",
  });

  return (
    <div className="space-y-8">
      <PrototypeNotice />

      <div>
        <Link
          href="/admin/communications"
          className="text-xs font-medium text-gray-500 transition-colors hover:text-emerald-brand"
        >
          Back to Email Broadcasts
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-ink">
              {broadcast.subject}
            </h1>
            <p className="mt-2 text-sm text-gray-500">{timingLine}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {canEdit ? (
              <Link
                href={`/admin/communications/${broadcast.id}/edit`}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-canvas"
              >
                Continue editing
              </Link>
            ) : null}
            <BroadcastStatusPill status={broadcast.status} />
          </div>
        </div>
      </div>

      {broadcast.statusNote ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
          {broadcast.statusNote}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <dl className="divide-y divide-gray-100">
          <SummaryRow label="From">
            <span className="font-medium">{sender.name}</span>
            <span className="ml-2 text-gray-400">{sender.address}</span>
          </SummaryRow>
          <SummaryRow label="Audience">
            {audience.label}
            <span className="ml-2 text-gray-400">
              {formatRecipientCount(broadcast.recipientCount)} recipients
            </span>
          </SummaryRow>
          <SummaryRow label="Preview text">
            {broadcast.previewText ? (
              broadcast.previewText
            ) : (
              <span className="text-gray-400">None set</span>
            )}
          </SummaryRow>
        </dl>
      </section>

      {isDraft ? null : (
        <section>
          <h2 className="text-sm font-semibold text-ink">Delivery</h2>
          <div className="mt-3 grid grid-cols-2 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <DeliveryStat
              label="Total recipients"
              value={formatRecipientCount(broadcast.recipientCount)}
            />
            <DeliveryStat label="Sent" value={formatRecipientCount(attempted)} />
            <DeliveryStat
              label="Delivered"
              value={formatRecipientCount(broadcast.delivered)}
            />
            <DeliveryStat
              label="Failed or bounced"
              value={formatRecipientCount(broadcast.failed)}
              tone={broadcast.failed > 0 ? "warning" : "muted"}
            />
          </div>
          {broadcast.status === "sending" || broadcast.status === "queued" ? (
            <p className="mt-3 text-xs text-gray-500">
              Delivery is still in progress. These numbers update as the
              provider reports back, one message at a time.
            </p>
          ) : null}
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-ink">Message</h2>
        <p className="mt-1 text-xs text-gray-500">
          {isDraft
            ? "What a recipient would receive if this went now."
            : "Exactly what landed in the recipient inbox. Each recipient's unsubscribe link is personal to them, so it is shown inert here."}
        </p>
        <div className="mt-3 rounded-xl border border-gray-200 bg-canvas p-3 sm:p-5">
          <EmailFrame
            html={emailHtml}
            title={`Email preview: ${broadcast.subject}`}
            className="h-[620px] rounded-lg"
          />
        </div>
      </section>
    </div>
  );
}
