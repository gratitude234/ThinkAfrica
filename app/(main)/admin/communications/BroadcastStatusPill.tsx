import { BROADCAST_STATUS_META, type BroadcastStatus } from "@/lib/broadcasts";

export default function BroadcastStatusPill({
  status,
}: {
  status: BroadcastStatus;
}) {
  const meta = BROADCAST_STATUS_META[status];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${meta.className}`}
    >
      {status === "sending" ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-current"
        />
      ) : null}
      {meta.label}
    </span>
  );
}
