"use client";

import Link from "next/link";
import {
  type ActionInboxItem,
  type ActionInboxSummary,
} from "@/lib/actionInbox";
import { trackActivationEvent } from "@/lib/activationEvents";

interface ActionInboxPanelProps {
  summary: ActionInboxSummary;
  source: string;
  compact?: boolean;
}

function trackAction(item: ActionInboxItem, source: string) {
  trackActivationEvent({
    event: "next_action_clicked",
    metadata: {
      actionKey: item.actionKey,
      label: item.cta,
      source,
      notificationId: item.notificationId,
      type: item.type,
      postId: item.postId,
    },
  });
  trackActivationEvent({
    event: "notification_opened",
    metadata: {
      notificationId: item.notificationId,
      type: item.type,
      source,
      postId: item.postId,
    },
  });
}

export default function ActionInboxPanel({
  summary,
  source,
  compact = false,
}: ActionInboxPanelProps) {
  /**
   * Everything in this panel sits under a "Needs attention" heading, so everything
   * in it has to actually need attention.
   *
   * It used to headline `primaryAction` -- the newest unread row of any kind -- and
   * fill its secondary cards with any unread item, so a single new follower could
   * render here as "Needs attention: New follower" with a primary CTA, and a row of
   * likes could sit underneath it. /notifications and the bell moved to
   * `primaryActionable` earlier; this was the last surface still over-claiming.
   *
   * The panel now hides itself when nothing is actionable, which is the honest
   * outcome for a section with that name.
   */
  const primaryAction = summary.primaryActionable;
  if (!primaryAction) return null;

  const secondaryItems = summary.items
    .filter(
      (item) =>
        !item.read &&
        item.actionable &&
        item.notificationId !== primaryAction.notificationId
    )
    .slice(0, 3);

  return (
    <section
      className={`mb-6 rounded-xl border border-emerald-200 bg-emerald-50/70 ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Needs attention
          </p>
          <h2 className="mt-1 text-lg font-semibold text-gray-950">
            {primaryAction.label}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-emerald-900/75">
            {primaryAction.description}
          </p>
          {summary.staleUnreadCount > 0 ? (
            <p className="mt-2 text-xs font-medium text-amber-700">
              {summary.staleUnreadCount} unread item
              {summary.staleUnreadCount === 1 ? "" : "s"} older than 7 days
            </p>
          ) : null}
        </div>
        <Link
          href={primaryAction.href}
          onClick={() => trackAction(primaryAction, source)}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37]"
        >
          {primaryAction.cta}
        </Link>
      </div>

      {secondaryItems.length > 0 ? (
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {secondaryItems.map((item) => (
            <Link
              key={item.notificationId}
              href={item.href}
              onClick={() => trackAction(item, `${source}_secondary`)}
              className="rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm transition-colors hover:bg-emerald-50"
            >
              <p className="font-semibold text-gray-900">{item.label}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                {item.description}
              </p>
              <p className="mt-2 text-xs font-semibold text-emerald-700">
                {item.cta}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <Link
          href="/notifications"
          className="mt-4 inline-flex text-xs font-semibold text-emerald-700 hover:text-emerald-800"
        >
          View all notifications
        </Link>
      )}
    </section>
  );
}
