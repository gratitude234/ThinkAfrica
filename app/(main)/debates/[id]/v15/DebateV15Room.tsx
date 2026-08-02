"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  advanceDebatePhaseV15Action,
  cancelDebateV15Action,
  castFinalVoteV15Action,
  completeDebateV15Action,
  extendDeadlineV15Action,
  inviteDebaterV15Action,
  remindVotersV15Action,
  respondToDebateInvitationV15Action,
  retryDebateRecapV15Action,
  revokeDebateInvitationV15Action,
  searchDebatersV15Action,
  startDebateV15Action,
  submitDebateArgumentV15Action,
  toggleArgumentUpvoteV15Action,
} from "./actions";
import type {
  DebateV15ActionResult,
  DebateV15Argument,
  DebateV15Phase,
  DebateV15Profile,
  DebateV15RoomData,
  DebateV15Slot,
  DebateV15Source,
  DebateV15Stance,
} from "./types";
import { loadDebateV15RoomSignal } from "./loadRoomSignal";
import {
  debateV15SignalFromRoom,
  debateV15SignalsDiffer,
  type DebateV15RoomSignal,
} from "./roomSignal";
import {
  resolveDebateV15Guidance,
  type DebateV15Role,
} from "./roomGuidance";
import RecapPoller from "../RecapPoller";
import { resolveDebateV15Verdict } from "@/lib/debateV15";

const POLL_INTERVAL_MS = 15_000;

const PHASES: Array<{
  key: DebateV15Phase;
  label: string;
  /** Narrow-screen form: five full labels do not fit across a phone. */
  short: string;
}> = [
  { key: "recruiting", label: "Recruiting", short: "Recruit" },
  { key: "opening", label: "Opening", short: "Open" },
  { key: "rebuttal", label: "Rebuttal", short: "Rebut" },
  { key: "voting", label: "Final vote", short: "Vote" },
  { key: "completed", label: "Verdict", short: "Verdict" },
];

const PHASE_COPY: Record<
  Exclude<DebateV15Phase, "recruiting" | "completed">,
  { title: string; next: string }
> = {
  opening: {
    title: "Opening arguments",
    next: "Next: Rebuttals",
  },
  rebuttal: {
    title: "Rebuttals",
    next: "Next: Final community vote",
  },
  voting: {
    title: "Final community vote",
    next: "Next: Verdict and recap",
  },
};

interface MutateOptions {
  /**
   * Confirmation copy for this specific action. When omitted the action
   * completes silently rather than announcing a generic "Saved." — lightweight
   * interactions (upvotes) reflect their own state in-place, while
   * irreversible ones (submitting an argument, casting the final vote) must
   * say exactly what happened.
   */
  success?: string;
  onSuccess?: () => void;
  /**
   * Identifies the specific control that started this request, so only that
   * control shows a pending state. Everything else in the room stays usable.
   */
  key?: string;
}

type DebateV15Mutate = (
  action: () => Promise<DebateV15ActionResult>,
  options?: MutateOptions
) => void;

function draftStorageKey(
  debateId: string,
  phase: string,
  userId: string | null
): string {
  return `v15-draft:${debateId}:${phase}:${userId ?? "anon"}`;
}

function readStoredDraft(
  key: string
): { content: string; sources: Array<{ url: string; title: string }> } | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const record = parsed as Record<string, unknown>;
    const content = typeof record.content === "string" ? record.content : "";
    const sources = Array.isArray(record.sources)
      ? record.sources
          .filter(
            (entry): entry is { url: string; title?: string } =>
              Boolean(entry) &&
              typeof entry === "object" &&
              typeof (entry as { url?: unknown }).url === "string"
          )
          .map((entry) => ({ url: entry.url, title: entry.title ?? "" }))
      : [];

    if (!content.trim() && !sources.length) return null;
    return { content, sources };
  } catch {
    return null;
  }
}

function formatMinutesLeft(minutes: number): string {
  if (minutes < 1) return "less than a minute";
  if (minutes === 1) return "1 minute";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 1 && !rest) return "1 hour";
  if (!rest) return `${hours} hours`;
  return `${hours}h ${rest}m`;
}

function profileName(profile: DebateV15Profile | null): string {
  return profile?.fullName ?? profile?.username ?? "Unknown member";
}

function initials(profile: DebateV15Profile | null): string {
  return profileName(profile)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function deadlineForPhase(
  room: DebateV15RoomData,
  phase: DebateV15Phase
): string | null {
  if (phase === "recruiting") return room.debate.recruitingDeadline;
  if (phase === "opening") return room.debate.openingDeadline;
  if (phase === "rebuttal") return room.debate.rebuttalDeadline;
  if (phase === "voting") return room.debate.votingDeadline;
  return null;
}

function useClockTick(initialNow: number): number {
  // `initialNow` is serialized with the room data, so the server render and
  // the client's first render agree. The value then refreshes once a minute.
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  return now;
}

/**
 * Keeps the room in step with everyone else in it. A debate is a shared,
 * deadline-driven space: the moderator advances the phase, the opponent
 * posts, a deadline gets extended. Without this the room only changed when
 * the viewer themselves acted, so a debater could sit on a stale "opening"
 * screen well after rebuttals had started.
 *
 * Polling rather than a realtime subscription is deliberate -- see
 * loadRoomSignal.ts. Ticks never overlap, pause while the tab is hidden,
 * and stop entirely once the debate can no longer change.
 */
function useRoomLiveSync(
  room: DebateV15RoomData,
  isTerminal: boolean,
  onChange: () => void
) {
  const debateId = room.debate.id;
  // Seeded from the server-rendered room so the very first tick can already
  // detect anything that changed since this page was rendered.
  const lastSignalRef = useRef<DebateV15RoomSignal | null>(
    debateV15SignalFromRoom(room)
  );
  // Held in a ref so a new callback identity on each render doesn't tear
  // down and restart the polling interval.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (isTerminal) return;

    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (inFlight || cancelled || document.hidden) return;
      inFlight = true;
      try {
        const signal = await loadDebateV15RoomSignal(debateId);
        if (!signal || cancelled) return;

        const previous = lastSignalRef.current;
        lastSignalRef.current = signal;

        if (previous && debateV15SignalsDiffer(previous, signal)) {
          onChangeRef.current();
        }
      } catch {
        // A failed tick keeps the previous baseline so the next comparison
        // is still made against known-good state rather than a gap.
      } finally {
        inFlight = false;
      }
    };

    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    // A tab returning to the foreground has missed every paused tick, so
    // catch up immediately instead of waiting out the next interval.
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [debateId, isTerminal]);
}

function resolveViewerRole(room: DebateV15RoomData): DebateV15Role {
  if (room.isManager) return "moderator";
  if (!room.currentUserId) return "guest";

  const ownSlot = room.slots.find(
    (slot) => slot.userId === room.currentUserId
  );
  if (ownSlot?.status === "accepted") return "debater";
  if (ownSlot?.status === "invited") return "invitee";
  return "reader";
}

/**
 * The room's answer to "what is mine to do?", shown before any of the stage
 * detail. Colour follows the tone so the two states a viewer most needs to
 * tell apart -- "you are holding this up" and "a deadline went by" -- are
 * distinguishable at a glance, with the wording carrying the meaning for
 * anyone who cannot use colour.
 */
function RoomGuidanceCallout({ room, now }: { room: DebateV15RoomData; now: number }) {
  const phase = room.debate.phase;
  if (room.debate.status === "cancelled") return null;

  const deadline = deadlineForPhase(room, phase);
  const deadlinePassed = Boolean(
    deadline && new Date(deadline).getTime() < now
  );
  const acceptedSlots = room.slots.filter((slot) => slot.status === "accepted");
  const phaseArguments =
    phase === "opening" || phase === "rebuttal"
      ? room.arguments.filter((argument) => argument.phase === phase)
      : [];

  const guidance = resolveDebateV15Guidance({
    role: resolveViewerRole(room),
    phase,
    deadlinePassed,
    bothDebatersAccepted: acceptedSlots.length === 2,
    viewerHasSubmitted: phaseArguments.some(
      (argument) => argument.authorId === room.currentUserId
    ),
    missingSides: (["for", "against"] as const).filter(
      (stance) =>
        !phaseArguments.some((argument) => argument.stance === stance)
    ),
    viewerHasVoted: Boolean(room.userFinalVote),
  });

  const tone =
    guidance.tone === "action"
      ? "border-emerald-brand bg-green-tint"
      : guidance.tone === "warning"
        ? "border-gold bg-gold-tint"
        : "border-green-wash-border bg-surface";
  const headingTone =
    guidance.tone === "action"
      ? "text-emerald-brand"
      : guidance.tone === "warning"
        ? "text-gold-ink"
        : "text-ink";

  return (
    <section
      // Announced, not alerting: it re-resolves on every poll tick, and an
      // assertive role would interrupt a screen reader mid-argument.
      role="status"
      className={`mb-6 rounded-2xl border border-l-4 p-5 ${tone}`}
    >
      <p className={`text-base font-bold ${headingTone}`}>{guidance.heading}</p>
      <p className="mt-1.5 max-w-3xl text-sm leading-6 text-ink-muted">
        {guidance.body}
      </p>
    </section>
  );
}

function formatCountdown(msLeft: number): string {
  const total = Math.floor(msLeft / 1000);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  if (days > 0) return `${days}d ${hours}h ${pad(minutes)}m`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Live countdown to the active deadline. The room previously showed only an
 * absolute timestamp, leaving "how long have I actually got?" as mental
 * arithmetic across timezones -- the debates list already ran a countdown,
 * so the room was the weaker of the two.
 *
 * Renders nothing until mounted: the remaining time differs between the
 * server render and the client's first paint by definition, so there is no
 * markup to match.
 */
function DeadlineCountdown({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  const [msLeft, setMsLeft] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(value).getTime();
    if (Number.isNaN(target)) return;

    const update = () => setMsLeft(target - Date.now());
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [value]);

  if (msLeft === null) return null;

  const passed = msLeft <= 0;
  const urgent = !passed && msLeft <= 10 * 60 * 1000;
  const soon = !passed && !urgent && msLeft <= 60 * 60 * 1000;
  const tone = passed
    ? "text-red-700"
    : urgent
      ? "text-red-700"
      : soon
        ? "text-gold-ink"
        : "text-ink-muted";

  return (
    <span
      // Announcing every tick would make a screen reader unusable; the
      // surrounding panels state the deadline in full.
      role="timer"
      aria-live="off"
      className={`inline-flex items-center gap-1.5 font-semibold tabular-nums ${tone} ${className}`}
    >
      {urgent ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-600 motion-reduce:animate-none"
        />
      ) : null}
      {passed ? "Deadline passed" : `${formatCountdown(msLeft)} left`}
    </span>
  );
}

function LocalDeadline({
  value,
  compact = false,
}: {
  value: string | null;
  compact?: boolean;
}) {
  if (!value) return <span>Not scheduled</span>;
  const date = new Date(value);
  const local = new Intl.DateTimeFormat(undefined, {
    dateStyle: compact ? "medium" : "long",
    timeStyle: "short",
  }).format(date);
  const wat = new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(date);

  return (
    <span suppressHydrationWarning>
      <time dateTime={value}>{local}</time>
      {!compact ? (
        <span className="mt-0.5 block text-xs text-ink-muted">{wat} WAT</span>
      ) : null}
    </span>
  );
}

function SideMark({
  stance,
  long = false,
}: {
  stance: DebateV15Stance;
  long?: boolean;
}) {
  const isFor = stance === "for";
  return (
    <span
      className={`inline-flex items-center gap-2 font-extrabold uppercase tracking-[0.12em] ${
        isFor ? "text-emerald-brand" : "text-purple-accent"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-sm ${
          isFor ? "bg-green-tint" : "bg-purple-tint"
        }`}
      >
        {isFor ? "+" : "−"}
      </span>
      {long ? (isFor ? "For the motion" : "Against the motion") : stance}
    </span>
  );
}

function ProfileBadge({ profile }: { profile: DebateV15Profile | null }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-wash text-sm font-bold text-emerald-brand">
        {initials(profile)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">
          {profileName(profile)}
        </span>
        <span className="block truncate text-xs text-ink-muted">
          {profile?.university ??
            (profile?.username
              ? `@${profile.username}`
              : profile
                ? "Indegenius member"
                : "Profile unavailable")}
        </span>
      </span>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone = "primary",
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger" | "quiet" | "gold";
  type?: "button" | "submit";
  className?: string;
}) {
  const tones = {
    primary: "bg-emerald-brand text-white hover:opacity-90",
    secondary:
      "border border-green-wash-border bg-surface text-ink hover:bg-green-wash",
    danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    quiet: "text-emerald-brand hover:bg-green-wash",
    gold: "bg-gold text-white hover:opacity-90",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

function PhaseProgress({ phase }: { phase: DebateV15Phase }) {
  const activeIndex = PHASES.findIndex((item) => item.key === phase);
  return (
    <ol
      aria-label="Debate progress"
      className="grid grid-cols-5 overflow-hidden rounded-xl border border-green-wash-border bg-surface"
    >
      {PHASES.map((item, index) => {
        const isCurrent = index === activeIndex;
        const isDone = index < activeIndex;
        return (
          <li
            key={item.key}
            aria-current={isCurrent ? "step" : undefined}
            className={`border-r border-green-wash-border px-2 py-3 text-center last:border-r-0 ${
              isCurrent
                ? "bg-emerald-brand text-white"
                : isDone
                  ? "bg-green-tint text-emerald-brand"
                  : "text-ink-muted"
            }`}
          >
            {/* The visible marks are decorative duplicates of the sr-only
                step description below, which always carries the full label
                regardless of breakpoint -- a screen reader should never be
                left announcing a bare "3". */}
            <span
              aria-hidden="true"
              className="block text-[10px] font-bold uppercase tracking-wide"
            >
              {isDone ? "✓" : index + 1}
            </span>
            <span
              aria-hidden="true"
              className="mt-0.5 block text-[11px] font-semibold leading-tight sm:hidden"
            >
              {item.short}
            </span>
            <span
              aria-hidden="true"
              className="mt-0.5 hidden text-xs font-semibold sm:block"
            >
              {item.label}
            </span>
            <span className="sr-only">
              {`Step ${index + 1} of ${PHASES.length}: ${item.label}${
                isDone ? " (completed)" : isCurrent ? " (current step)" : ""
              }`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ArgumentCard({
  argument,
  upvoted,
  canUpvote,
  busy,
  onUpvote,
}: {
  argument: DebateV15Argument;
  upvoted: boolean;
  canUpvote: boolean;
  busy: boolean;
  onUpvote: (argumentId: string) => void;
}) {
  return (
    <article
      className={`rounded-xl border bg-surface p-5 ${
        argument.stance === "for"
          ? "border-green-wash-border"
          : "border-purple-tint"
      }`}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <ProfileBadge profile={argument.author} />
        <div className="flex flex-col items-end gap-1">
          <SideMark stance={argument.stance} />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {argument.phase}
          </span>
        </div>
      </header>
      <p className="whitespace-pre-wrap text-[15px] leading-7 text-ink">
        {argument.content}
      </p>
      {argument.sources.length ? (
        <div className="mt-4 border-t border-green-wash-border pt-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">
            Sources
          </p>
          <ul className="space-y-1.5">
            {argument.sources.map((source) => (
              <li key={source.id}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm font-medium text-emerald-brand underline decoration-green-wash-border underline-offset-4"
                >
                  {source.title || source.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <footer className="mt-4 flex items-center justify-between border-t border-green-wash-border pt-3">
        <span className="text-xs text-ink-muted">Argument quality signal</span>
        <button
          type="button"
          aria-pressed={upvoted}
          aria-label={`${upvoted ? "Remove upvote from" : "Upvote"} ${argument.stance} ${argument.phase} argument`}
          disabled={!canUpvote || busy}
          onClick={() => onUpvote(argument.id)}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-emerald-brand ${
            upvoted
              ? "bg-gold-tint text-gold-ink"
              : "bg-green-wash text-ink-muted hover:text-ink"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          ▲ {argument.upvotes}
        </button>
      </footer>
    </article>
  );
}

function EmptyArgument({
  stance,
  phase,
  deadlinePassed,
}: {
  stance: DebateV15Stance;
  phase: "opening" | "rebuttal";
  deadlinePassed: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed border-green-wash-border bg-green-wash p-5 text-sm leading-6 text-ink-muted">
      <SideMark stance={stance} />
      <p className="mt-3">
        {deadlinePassed
          ? `Deadline passed. ${stance.toUpperCase()} did not submit ${
              phase === "opening" ? "an opening argument" : "a rebuttal"
            }.`
          : `Awaiting ${stance.toUpperCase()}'s ${phase} argument.`}
      </p>
    </div>
  );
}

function ArgumentColumns({
  phase,
  argumentsForPhase,
  deadlinePassed,
  room,
  pending,
  onUpvote,
}: {
  phase: "opening" | "rebuttal";
  argumentsForPhase: DebateV15Argument[];
  deadlinePassed: boolean;
  room: DebateV15RoomData;
  pending: string | null;
  onUpvote: (id: string) => void;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {(["for", "against"] as const).map((stance) => {
        const argument = argumentsForPhase.find(
          (item) => item.stance === stance
        );
        return (
          <section key={stance} aria-label={`${stance} ${phase} argument`}>
            <div
              className={`mb-3 rounded-lg px-4 py-3 ${
                stance === "for" ? "bg-green-tint" : "bg-purple-tint"
              }`}
            >
              <SideMark stance={stance} long />
            </div>
            {argument ? (
              <ArgumentCard
                argument={argument}
                upvoted={room.userUpvotedArgumentIds.includes(argument.id)}
                canUpvote={
                  Boolean(room.currentUserId) &&
                  room.debate.status === "active"
                }
                busy={pending === `upvote:${argument.id}`}
                onUpvote={onUpvote}
              />
            ) : (
              <EmptyArgument
                stance={stance}
                phase={phase}
                deadlinePassed={deadlinePassed}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}

function ArgumentComposer({
  room,
  phase,
  busy,
  expired,
  deadline,
  now,
  submit,
}: {
  room: DebateV15RoomData;
  phase: "opening" | "rebuttal";
  busy: boolean;
  /**
   * The submission window has closed. The composer stays mounted and keeps the
   * debater's text — unmounting it would destroy an unsent draft the moment
   * the clock ticks past the deadline.
   */
  expired: boolean;
  deadline: string | null;
  now: number;
  submit: (
    content: string,
    sources: Array<{ url: string; title?: string }>,
    onSubmitted: () => void
  ) => void;
}) {
  const storageKey = draftStorageKey(
    room.debate.id,
    phase,
    room.currentUserId
  );
  const [content, setContent] = useState("");
  const [sources, setSources] = useState([{ url: "", title: "" }]);
  const [confirmed, setConfirmed] = useState(false);
  const [restored, setRestored] = useState(false);
  const [copied, setCopied] = useState(false);
  const hydrated = useRef(false);
  const maxWords = phase === "opening" ? 300 : 200;
  const count = content.trim() ? content.trim().split(/\s+/).length : 0;
  const overLimit = count > maxWords;
  const invalidSource = sources.some(
    (source) =>
      source.url.trim() && !/^https?:\/\/\S+$/i.test(source.url.trim())
  );

  // Restore any draft left behind by a refresh, a closed tab, or a phone
  // evicting the page from memory. Read after mount so the server and client
  // first render agree.
  useEffect(() => {
    const saved = readStoredDraft(storageKey);
    if (saved) {
      setContent(saved.content);
      if (saved.sources.length) setSources(saved.sources);
      setRestored(true);
    }
    hydrated.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    const timer = window.setTimeout(() => {
      try {
        const hasSource = sources.some((source) => source.url.trim());
        if (!content.trim() && !hasSource) {
          window.localStorage.removeItem(storageKey);
          return;
        }
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({ content, sources, savedAt: Date.now() })
        );
      } catch {
        // Storage can be full or blocked (private mode). The composer still
        // works; it just loses the safety net.
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [content, sources, storageKey]);

  const clearDraft = () => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Nothing to recover from — the submission already succeeded.
    }
  };

  const minutesLeft =
    deadline && !expired
      ? Math.floor((new Date(deadline).getTime() - now) / 60_000)
      : null;
  const closingSoon = minutesLeft !== null && minutesLeft <= 30;

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const blockedReason = expired
    ? `The ${phase} deadline has passed, so this can no longer be submitted.`
    : !content.trim()
      ? "Write your argument to enable submission."
      : overLimit
        ? `Remove ${count - maxWords} ${
            count - maxWords === 1 ? "word" : "words"
          } to fit the ${maxWords}-word limit.`
        : invalidSource
          ? "Every source URL must begin with http:// or https://."
          : !confirmed
            ? "Tick the confirmation box to enable submission."
            : null;

  const addSource = () => {
    if (sources.length < 5) setSources([...sources, { url: "", title: "" }]);
  };
  const updateSource = (
    index: number,
    field: "url" | "title",
    value: string
  ) => {
    setSources((current) =>
      current.map((source, sourceIndex) =>
        sourceIndex === index ? { ...source, [field]: value } : source
      )
    );
  };
  const removeSource = (index: number) =>
    setSources((current) =>
      current.length === 1
        ? [{ url: "", title: "" }]
        : current.filter((_, sourceIndex) => sourceIndex !== index)
    );

  return (
    <section
      id="submit-argument"
      className="rounded-2xl border border-green-wash-border bg-surface p-5 sm:p-6"
    >
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-brand">
        {expired ? "Submission window closed" : "Your next action"}
      </p>
      <h3 className="mt-1 font-display text-2xl font-bold text-ink">
        Submit your {phase}
      </h3>
      <p className="mt-2 text-sm leading-6 text-ink-muted">
        Make one focused case. Your stance is locked, and this submission
        cannot be edited after it is sent.
      </p>

      {expired ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm font-semibold text-red-700">
            The {phase} deadline passed before this was submitted.
          </p>
          <p className="mt-1 text-sm leading-6 text-red-700">
            {content.trim()
              ? `Your draft below has been kept so nothing is lost. Copy it now, and ask the moderator to extend the ${phase} deadline if you still want it on the record.`
              : `Ask the moderator to extend the ${phase} deadline if you still want to take part.`}
          </p>
          {content.trim() ? (
            <ActionButton
              tone="danger"
              className="mt-3"
              onClick={copyDraft}
            >
              {copied ? "Draft copied" : "Copy my draft"}
            </ActionButton>
          ) : null}
        </div>
      ) : null}

      {!expired && restored ? (
        <p
          role="status"
          className="mt-4 rounded-xl border border-green-wash-border bg-green-tint p-3 text-sm font-semibold text-emerald-brand"
        >
          We restored the draft you had saved on this device.
        </p>
      ) : null}

      {closingSoon && minutesLeft !== null ? (
        <p
          role="status"
          className="mt-4 rounded-xl border border-gold bg-gold-tint p-3 text-sm font-semibold text-gold-ink"
        >
          {minutesLeft <= 0
            ? "This deadline is passing right now — submit immediately."
            : `Only ${formatMinutesLeft(minutesLeft)} left to submit your ${phase}.`}
        </p>
      ) : null}

      <label
        htmlFor="v15-argument"
        className="mt-5 block text-sm font-semibold text-ink"
      >
        Argument
      </label>
      <textarea
        id="v15-argument"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        readOnly={expired}
        rows={9}
        maxLength={5000}
        placeholder={`Write your ${phase} argument…`}
        className={`mt-2 w-full rounded-xl border border-green-wash-border px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-emerald-brand focus:ring-2 focus:ring-green-tint ${
          expired ? "bg-green-wash" : "bg-canvas"
        }`}
      />
      <p
        className={`mt-1 text-right text-xs font-semibold ${
          overLimit ? "text-red-700" : "text-ink-muted"
        }`}
      >
        {count} / {maxWords} words
      </p>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-ink">
          Sources <span className="font-normal text-ink-muted">(optional)</span>
        </legend>
        <p className="mt-1 text-xs text-ink-muted">
          Add up to five links. URLs must begin with http:// or https://.
        </p>
        <div className="mt-3 space-y-3">
          {sources.map((source, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-xl bg-green-wash p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <label className="sr-only" htmlFor={`source-url-${index}`}>
                Source {index + 1} URL
              </label>
              <input
                id={`source-url-${index}`}
                type="url"
                inputMode="url"
                value={source.url}
                onChange={(event) =>
                  updateSource(index, "url", event.target.value)
                }
                placeholder="https://example.org/report"
                className="rounded-lg border border-green-wash-border bg-surface px-3 py-2 text-sm outline-none focus:border-emerald-brand"
              />
              <label className="sr-only" htmlFor={`source-title-${index}`}>
                Source {index + 1} title
              </label>
              <input
                id={`source-title-${index}`}
                value={source.title}
                maxLength={300}
                onChange={(event) =>
                  updateSource(index, "title", event.target.value)
                }
                placeholder="Source title"
                className="rounded-lg border border-green-wash-border bg-surface px-3 py-2 text-sm outline-none focus:border-emerald-brand"
              />
              <button
                type="button"
                onClick={() => removeSource(index)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-600"
                aria-label={`Remove source ${index + 1}`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {sources.length < 5 ? (
          <button
            type="button"
            onClick={addSource}
            className="mt-3 text-sm font-semibold text-emerald-brand underline underline-offset-4"
          >
            + Add another source
          </button>
        ) : null}
        {invalidSource ? (
          <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
            Each source URL must begin with http:// or https://.
          </p>
        ) : null}
      </fieldset>

      <label className="mt-5 flex items-start gap-3 rounded-xl bg-gold-tint p-4 text-sm leading-6 text-gold-ink">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-1 h-4 w-4 accent-emerald-brand"
        />
        <span>
          I have reviewed my argument and understand that submission is final.
        </span>
      </label>

      <ActionButton
        onClick={() =>
          submit(
            content.trim(),
            sources
              .filter((source) => source.url.trim())
              .map((source) => ({
                url: source.url.trim(),
                title: source.title.trim() || undefined,
              })),
            () => {
              clearDraft();
              setContent("");
              setSources([{ url: "", title: "" }]);
              setConfirmed(false);
              setRestored(false);
            }
          )
        }
        disabled={Boolean(blockedReason) || busy}
        aria-describedby={blockedReason ? "v15-submit-blocked" : undefined}
        className="mt-4 w-full"
      >
        {busy ? "Submitting…" : `Submit ${phase} — final`}
      </ActionButton>
      {blockedReason ? (
        <p
          id="v15-submit-blocked"
          className={`mt-2 text-center text-xs font-semibold ${
            expired ? "text-red-700" : "text-ink-muted"
          }`}
        >
          {blockedReason}
        </p>
      ) : null}
    </section>
  );
}

function InviteSearch({
  stance,
  busy,
  invite,
}: {
  stance: DebateV15Stance;
  busy: boolean;
  invite: (userId: string, stance: DebateV15Stance) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DebateV15Profile[]>([]);
  const [searching, startSearch] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const search = () =>
    startSearch(async () => {
      const result = await searchDebatersV15Action(query);
      setResults(result.profiles);
      setError(result.ok ? null : result.message ?? "Search failed.");
    });

  return (
    <div className="mt-4 rounded-xl border border-green-wash-border bg-green-wash p-4">
      <label
        htmlFor={`invite-search-${stance}`}
        className="text-sm font-semibold text-ink"
      >
        Find a member to invite
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id={`invite-search-${stance}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              search();
            }
          }}
          placeholder="Name or username"
          className="min-w-0 flex-1 rounded-lg border border-green-wash-border bg-surface px-3 py-2 text-sm outline-none focus:border-emerald-brand"
        />
        <ActionButton
          tone="secondary"
          onClick={search}
          disabled={query.trim().length < 2 || searching}
        >
          {searching ? "Searching…" : "Search"}
        </ActionButton>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {results.length ? (
        <ul className="mt-3 divide-y divide-green-wash-border rounded-lg border border-green-wash-border bg-surface">
          {results.map((profile) => (
            <li
              key={profile.id}
              className="flex items-center justify-between gap-3 p-3"
            >
              <ProfileBadge profile={profile} />
              <ActionButton
                onClick={() => invite(profile.id, stance)}
                disabled={busy}
              >
                Invite
              </ActionButton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SideSlot({
  room,
  stance,
  slot,
  pending,
  invite,
  respond,
  revoke,
  recruitingClosed,
}: {
  room: DebateV15RoomData;
  stance: DebateV15Stance;
  slot: DebateV15Slot | undefined;
  pending: string | null;
  invite: (userId: string, stance: DebateV15Stance) => void;
  respond: (accept: boolean) => void;
  revoke: (stance: DebateV15Stance) => void;
  recruitingClosed: boolean;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const isInvitee =
    Boolean(slot) && slot?.userId === room.currentUserId && slot.status === "invited";

  return (
    <section
      className={`rounded-2xl border p-5 ${
        stance === "for"
          ? "border-green-wash-border bg-green-wash"
          : "border-purple-tint bg-surface"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <SideMark stance={stance} long />
        <span className="text-xs font-semibold text-ink-muted">One slot</span>
      </div>

      {!slot ? (
        <div className="mt-5 rounded-xl border border-dashed border-green-wash-border bg-surface p-4">
          <p className="text-sm font-semibold text-ink">Not yet invited</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            The moderator chooses one debater for this side.
          </p>
          {room.isManager ? (
            <>
              <ActionButton
                tone="secondary"
                className="mt-3"
                onClick={() => setShowSearch((shown) => !shown)}
                disabled={recruitingClosed}
              >
                {recruitingClosed
                  ? "Recruiting deadline passed"
                  : showSearch
                    ? "Close search"
                    : "Invite a debater"}
              </ActionButton>
              {showSearch && !recruitingClosed ? (
                <InviteSearch
                  stance={stance}
                  busy={pending === `invite:${stance}`}
                  invite={invite}
                />
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-green-wash-border bg-surface p-4">
          <ProfileBadge profile={slot.profile} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                slot.status === "accepted"
                  ? "bg-green-tint text-emerald-brand"
                  : slot.status === "declined"
                    ? "bg-red-50 text-red-700"
                    : "bg-gold-tint text-gold-ink"
              }`}
            >
              {slot.status === "accepted"
                ? `${stance.toUpperCase()} — confirmed`
                : slot.status === "declined"
                  ? "Invitation declined"
                  : `${stance.toUpperCase()} — awaiting response`}
            </span>
            {room.isManager ? (
              <button
                type="button"
                disabled={pending === `revoke:${stance}` || recruitingClosed}
                onClick={() =>
                  slot.status === "accepted"
                    ? setConfirmRemoval(true)
                    : revoke(stance)
                }
                className="text-xs font-semibold text-red-700 underline underline-offset-4 disabled:opacity-50"
              >
                {slot.status === "accepted"
                  ? "Remove from slot"
                  : "Revoke invitation"}
              </button>
            ) : null}
          </div>

          {isInvitee ? (
            <div className="mt-4 border-t border-green-wash-border pt-4">
              <p className="text-sm leading-6 text-ink">
                Accepting commits you to submit one opening argument and one
                rebuttal before their deadlines. Your side is locked once you
                accept.
              </p>
              <div className="mt-3 flex gap-2">
                <ActionButton
                  onClick={() => respond(true)}
                  disabled={pending === "respond:accept" || recruitingClosed}
                >
                  {pending === "respond:accept"
                    ? "Accepting…"
                    : "Accept invitation"}
                </ActionButton>
                <ActionButton
                  tone="secondary"
                  onClick={() => respond(false)}
                  disabled={pending === "respond:decline" || recruitingClosed}
                >
                  {pending === "respond:decline" ? "Declining…" : "Decline"}
                </ActionButton>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {confirmRemoval && slot?.status === "accepted" ? (
        <Modal
          title={`Remove the ${stance.toUpperCase()} debater?`}
          close={() => setConfirmRemoval(false)}
        >
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Their accepted place will be cleared so you can invite a
            replacement. This is only available before the debate starts.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <ActionButton
              tone="quiet"
              onClick={() => setConfirmRemoval(false)}
            >
              Keep debater
            </ActionButton>
            <ActionButton
              tone="danger"
              disabled={pending === `revoke:${stance}`}
              onClick={() => {
                revoke(stance);
                setConfirmRemoval(false);
              }}
            >
              Remove from slot
            </ActionButton>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function Schedule({ room }: { room: DebateV15RoomData }) {
  const schedule = [
    ["Recruiting closes", room.debate.recruitingDeadline],
    ["Opening due", room.debate.openingDeadline],
    ["Rebuttal due", room.debate.rebuttalDeadline],
    ["Final vote due", room.debate.votingDeadline],
  ] as const;
  return (
    <section className="rounded-2xl border border-green-wash-border bg-surface p-5">
      <h2 className="font-display text-xl font-bold text-ink">Schedule</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Times use your local timezone. West Africa Time is shown underneath.
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {schedule.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-green-wash p-3">
            <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">
              {label}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-ink">
              <LocalDeadline value={value} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(close);

  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) close();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="v15-modal-title"
        className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="v15-modal-title"
            className="font-display text-2xl font-bold text-ink"
          >
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Close dialog"
            className="rounded-lg px-2 py-1 text-xl text-ink-muted hover:bg-green-wash"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ManagerControls({
  room,
  pending,
  mutate,
}: {
  room: DebateV15RoomData;
  pending: string | null;
  mutate: DebateV15Mutate;
}) {
  const [dialog, setDialog] = useState<
    "advance" | "extend" | "cancel" | null
  >(null);
  const [newDeadline, setNewDeadline] = useState("");
  const [reason, setReason] = useState("");
  const phase = room.debate.phase;
  const currentDeadline = deadlineForPhase(room, phase);
  const extendable =
    phase === "recruiting" ||
    phase === "opening" ||
    phase === "rebuttal" ||
    phase === "voting";
  const currentPhaseArguments =
    phase === "opening" || phase === "rebuttal"
      ? room.arguments.filter((argument) => argument.phase === phase)
      : [];
  const missingSides =
    phase === "opening" || phase === "rebuttal"
      ? (["for", "against"] as const).filter(
          (stance) =>
            !currentPhaseArguments.some(
              (argument) => argument.stance === stance
            )
        )
      : [];

  if (!room.isManager || room.debate.status === "cancelled") return null;

  return (
    <>
      <section className="rounded-2xl border border-gold bg-gold-tint p-5">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-gold-ink">
          Moderator controls
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {phase === "opening" || phase === "rebuttal" ? (
            <ActionButton onClick={() => setDialog("advance")}>
              {phase === "opening"
                ? "Advance to rebuttals"
                : "Open final voting"}
            </ActionButton>
          ) : null}
          {extendable ? (
            <ActionButton
              tone="secondary"
              onClick={() => setDialog("extend")}
            >
              Extend {phase} deadline
            </ActionButton>
          ) : null}
          {phase !== "completed" ? (
            <ActionButton tone="danger" onClick={() => setDialog("cancel")}>
              Cancel debate
            </ActionButton>
          ) : null}
        </div>
        {phase === "opening" || phase === "rebuttal" ? (
          <p className="mt-3 text-xs leading-5 text-gold-ink">
            Advancement is manual for this pilot. Check both sides before
            moving the room forward.
          </p>
        ) : null}
      </section>

      {dialog === "advance" &&
      (phase === "opening" || phase === "rebuttal") ? (
        <Modal
          title={
            phase === "opening"
              ? "Advance to rebuttals?"
              : "Open final voting?"
          }
          close={() => setDialog(null)}
        >
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Advancing is immediate and closes {phase} submissions. It cannot
            be undone.
          </p>
          {missingSides.length ? (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"
            >
              Warning: {missingSides.map((side) => side.toUpperCase()).join(" and ")}{" "}
              {missingSides.length === 1 ? "has" : "have"} not submitted a{" "}
              {phase} argument.
            </p>
          ) : (
            <p className="mt-4 rounded-xl bg-green-tint p-4 text-sm font-semibold text-emerald-brand">
              Both sides have submitted this phase.
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <ActionButton tone="quiet" onClick={() => setDialog(null)}>
              Keep {phase} open
            </ActionButton>
            <ActionButton
              disabled={pending === "advance"}
              onClick={() => {
                mutate(
                  () => advanceDebatePhaseV15Action(room.debate.id, phase),
                  {
                    key: "advance",
                    success:
                      phase === "opening"
                        ? "Opening arguments are closed. The room is now in rebuttals."
                        : "Rebuttals are closed. Final community voting is open.",
                  }
                );
                setDialog(null);
              }}
            >
              Confirm and advance
            </ActionButton>
          </div>
        </Modal>
      ) : null}

      {dialog === "extend" && currentDeadline ? (
        <Modal title={`Extend ${phase} deadline`} close={() => setDialog(null)}>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            The new time must be in the future and cannot cross the next
            scheduled deadline.
          </p>
          <label
            htmlFor="new-v15-deadline"
            className="mt-4 block text-sm font-semibold text-ink"
          >
            New deadline
          </label>
          <input
            id="new-v15-deadline"
            type="datetime-local"
            value={newDeadline}
            onChange={(event) => setNewDeadline(event.target.value)}
            className="mt-2 w-full rounded-lg border border-green-wash-border px-3 py-2 text-sm outline-none focus:border-emerald-brand"
          />
          <div className="mt-5 flex justify-end gap-2">
            <ActionButton tone="quiet" onClick={() => setDialog(null)}>
              Keep current time
            </ActionButton>
            <ActionButton
              disabled={!newDeadline || pending === "extend"}
              onClick={() => {
                mutate(
                  () =>
                    extendDeadlineV15Action(
                      room.debate.id,
                      phase as
                        | "recruiting"
                        | "opening"
                        | "rebuttal"
                        | "voting",
                      currentDeadline,
                      new Date(newDeadline).toISOString()
                    ),
                  {
                    key: "extend",
                    success: `The ${phase} deadline has been extended. Everyone in the room sees the new time.`,
                  }
                );
                setDialog(null);
              }}
            >
              Extend deadline
            </ActionButton>
          </div>
        </Modal>
      ) : null}

      {dialog === "cancel" ? (
        <Modal title="Cancel this debate?" close={() => setDialog(null)}>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            The debate will be labelled cancelled. Submitted arguments will
            remain readable.
          </p>
          <label
            htmlFor="v15-cancel-reason"
            className="mt-4 block text-sm font-semibold text-ink"
          >
            Reason for cancellation
          </label>
          <textarea
            id="v15-cancel-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={4}
            className="mt-2 w-full rounded-lg border border-green-wash-border px-3 py-2 text-sm outline-none focus:border-emerald-brand"
          />
          <div className="mt-5 flex justify-end gap-2">
            <ActionButton tone="quiet" onClick={() => setDialog(null)}>
              Keep debate
            </ActionButton>
            <ActionButton
              tone="danger"
              disabled={!reason.trim() || pending === "cancel"}
              onClick={() => {
                mutate(
                  () => cancelDebateV15Action(room.debate.id, reason.trim()),
                  {
                    key: "cancel",
                    success:
                      "The debate is cancelled. Everyone involved has been notified.",
                  }
                );
                setDialog(null);
              }}
            >
              Confirm cancellation
            </ActionButton>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function RecruitingView({
  room,
  pending,
  mutate,
}: {
  room: DebateV15RoomData;
  pending: string | null;
  mutate: DebateV15Mutate;
}) {
  const now = useClockTick(room.loadedAt);
  const forSlot = room.slots.find((slot) => slot.stance === "for");
  const againstSlot = room.slots.find((slot) => slot.stance === "against");
  const bothAccepted =
    forSlot?.status === "accepted" && againstSlot?.status === "accepted";
  const scheduleReady = Boolean(
    room.debate.recruitingDeadline &&
      room.debate.openingDeadline &&
      room.debate.rebuttalDeadline &&
      room.debate.votingDeadline
  );
  const recruitingClosed = Boolean(
    room.debate.recruitingDeadline &&
      new Date(room.debate.recruitingDeadline).getTime() < now
  );
  const openingClosed = Boolean(
    room.debate.openingDeadline &&
      new Date(room.debate.openingDeadline).getTime() < now
  );
  const invite = (userId: string, stance: DebateV15Stance) =>
    mutate(() => inviteDebaterV15Action(room.debate.id, userId, stance), {
      key: `invite:${stance}`,
    });
  const respond = (accept: boolean) =>
    mutate(
      () => respondToDebateInvitationV15Action(room.debate.id, accept),
      {
        key: accept ? "respond:accept" : "respond:decline",
        success: accept
          ? "You're confirmed as a debater. Watch the opening deadline — you get one submission."
          : "Invitation declined. The moderator can now invite someone else.",
      }
    );
  const revoke = (stance: DebateV15Stance) =>
    mutate(
      () => revokeDebateInvitationV15Action(room.debate.id, stance),
      {
        key: `revoke:${stance}`,
        success: `The ${stance.toUpperCase()} slot is clear. You can invite a replacement.`,
      }
    );

  return (
    <div className="space-y-5">
      <Schedule room={room} />
      {recruitingClosed && !bothAccepted ? (
        <p
          role="status"
          className="rounded-xl border border-gold bg-gold-tint p-4 text-sm font-semibold text-gold-ink"
        >
          The recruiting deadline has passed. The moderator must extend it
          before sending or answering invitations.
        </p>
      ) : null}
      <section>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-brand">
            Strict 1v1
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink">
            Confirm one debater on each side
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <SideSlot
            room={room}
            stance="for"
            slot={forSlot}
            pending={pending}
            invite={invite}
            respond={respond}
            revoke={revoke}
            recruitingClosed={recruitingClosed}
          />
          <SideSlot
            room={room}
            stance="against"
            slot={againstSlot}
            pending={pending}
            invite={invite}
            respond={respond}
            revoke={revoke}
            recruitingClosed={recruitingClosed}
          />
        </div>
      </section>

      {room.isManager ? (
        <section className="rounded-2xl border border-gold bg-gold-tint p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-gold-ink">
            Readiness checklist
          </p>
          <ul className="mt-3 space-y-2 text-sm text-ink">
            <li>{forSlot?.status === "accepted" ? "✓" : "○"} FOR confirmed</li>
            <li>
              {againstSlot?.status === "accepted" ? "✓" : "○"} AGAINST
              confirmed
            </li>
            <li>{scheduleReady ? "✓" : "○"} Schedule published</li>
          </ul>
          <ActionButton
            className="mt-4"
            onClick={() =>
              mutate(() => startDebateV15Action(room.debate.id), {
                key: "start",
                success:
                  "The debate is live. Both debaters can now submit opening arguments.",
              })
            }
            disabled={
              !bothAccepted ||
              !scheduleReady ||
              openingClosed ||
              pending === "start"
            }
          >
            {pending === "start" ? "Starting…" : "Start opening arguments"}
          </ActionButton>
          {!bothAccepted ? (
            <p className="mt-2 text-xs text-gold-ink">
              Start is locked until both invited debaters accept.
            </p>
          ) : openingClosed ? (
            <p className="mt-2 text-xs font-semibold text-red-700">
              The opening deadline has passed, so this debate cannot start.
              Cancel it and schedule a replacement.
            </p>
          ) : null}
        </section>
      ) : (
        <p className="rounded-2xl border border-green-wash-border bg-green-wash p-5 text-sm leading-6 text-ink-muted">
          Waiting for both sides to be confirmed. The moderator cannot start
          the debate until each side has an accepted debater.
        </p>
      )}

      <ManagerControls room={room} pending={pending} mutate={mutate} />
    </div>
  );
}

function ActiveArgumentView({
  room,
  phase,
  pending,
  mutate,
}: {
  room: DebateV15RoomData;
  phase: "opening" | "rebuttal";
  pending: string | null;
  mutate: DebateV15Mutate;
}) {
  const now = useClockTick(room.loadedAt);
  const deadline = deadlineForPhase(room, phase);
  const passed = Boolean(deadline && new Date(deadline).getTime() < now);
  const phaseArguments = room.arguments.filter(
    (argument) => argument.phase === phase
  );
  const openings = room.arguments.filter(
    (argument) => argument.phase === "opening"
  );
  const userSlot = room.slots.find(
    (slot) =>
      slot.userId === room.currentUserId && slot.status === "accepted"
  );
  const alreadySubmitted = phaseArguments.some(
    (argument) => argument.authorId === room.currentUserId
  );
  // Deliberately not gated on `passed`. The composer stays mounted once the
  // deadline lapses so an unsent draft survives the clock tick; it renders in
  // a locked state instead of vanishing mid-sentence.
  const canCompose = Boolean(userSlot) && !alreadySubmitted;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-emerald-brand p-6 text-white">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/70">
          Current phase
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-3xl font-bold">
              {PHASE_COPY[phase].title}
            </h2>
            <p className="mt-1 text-sm text-white/75">
              {PHASE_COPY[phase].next}
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 text-sm">
            <span className="block text-xs font-bold uppercase tracking-wide text-white/60">
              {passed ? "Deadline passed" : "Submission deadline"}
            </span>
            <LocalDeadline value={deadline} compact />
            {deadline && !passed ? (
              <DeadlineCountdown
                value={deadline}
                className="mt-1 block text-xs !text-white"
              />
            ) : null}
          </div>
        </div>
      </section>

      {phase === "rebuttal" ? (
        <section className="rounded-2xl border border-green-wash-border bg-green-wash p-5">
          <h2 className="font-display text-xl font-bold text-ink">
            Opening arguments for reference
          </h2>
          <div className="mt-4">
            <ArgumentColumns
              phase="opening"
              argumentsForPhase={openings}
              deadlinePassed
              room={room}
              pending={pending}
              onUpvote={(id) =>
                mutate(
                  () => toggleArgumentUpvoteV15Action(room.debate.id, id),
                  { key: `upvote:${id}` }
                )
              }
            />
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-4 font-display text-2xl font-bold text-ink">
          {phase === "opening" ? "The opening cases" : "The rebuttals"}
        </h2>
        <ArgumentColumns
          phase={phase}
          argumentsForPhase={phaseArguments}
          deadlinePassed={passed}
          room={room}
          pending={pending}
          onUpvote={(id) =>
            mutate(() => toggleArgumentUpvoteV15Action(room.debate.id, id), {
              key: `upvote:${id}`,
            })
          }
        />
      </section>

      {canCompose ? (
        <ArgumentComposer
          room={room}
          phase={phase}
          busy={pending === "submit-argument"}
          expired={passed}
          deadline={deadline}
          now={now}
          submit={(content, sources, onSubmitted) =>
            mutate(
              () =>
                submitDebateArgumentV15Action(
                  room.debate.id,
                  content,
                  sources
                ),
              {
                key: "submit-argument",
                success: `Your ${phase} argument is submitted and locked on the record.`,
                onSuccess: onSubmitted,
              }
            )
          }
        />
      ) : alreadySubmitted && userSlot ? (
        <p className="rounded-xl bg-green-tint p-4 text-sm font-semibold text-emerald-brand">
          ✓ Your {phase} is submitted. Submissions are final.
        </p>
      ) : null}

      <ManagerControls room={room} pending={pending} mutate={mutate} />
    </div>
  );
}

function VotingView({
  room,
  pending,
  mutate,
}: {
  room: DebateV15RoomData;
  pending: string | null;
  mutate: DebateV15Mutate;
}) {
  const now = useClockTick(room.loadedAt);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reminded, setReminded] = useState(false);
  const { total, forPercent, againstPercent } = resolveDebateV15Verdict(
    room.debate.forVotes,
    room.debate.againstVotes
  );
  const deadlinePassed = Boolean(
    room.debate.votingDeadline &&
      new Date(room.debate.votingDeadline).getTime() < now
  );

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-emerald-brand p-6 text-white">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/70">
          Argument submission is closed
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-3xl font-bold">
              Final community vote
            </h2>
            <p className="mt-1 text-sm text-white/75">
              Read both sides, then decide the verdict.
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 text-sm">
            <span className="block text-xs font-bold uppercase tracking-wide text-white/60">
              Voting deadline
            </span>
            <LocalDeadline value={room.debate.votingDeadline} compact />
            {room.debate.votingDeadline && !deadlinePassed ? (
              <DeadlineCountdown
                value={room.debate.votingDeadline}
                className="mt-1 block text-xs !text-white"
              />
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gold bg-gold-tint p-5">
        <h2 className="font-display text-2xl font-bold text-ink">
          Cast the vote that decides the verdict
        </h2>
        <p className="mt-2 text-sm leading-6 text-gold-ink">
          Argument upvotes identify strong arguments. They do not decide the
          debate — only your final vote counts toward the verdict.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {(["for", "against"] as const).map((stance) => (
            <button
              key={stance}
              type="button"
              aria-pressed={room.userFinalVote === stance}
              disabled={
                !room.currentUserId ||
                deadlinePassed ||
                pending === `final-vote:${stance}`
              }
              onClick={() =>
                mutate(
                  () => castFinalVoteV15Action(room.debate.id, stance),
                  {
                    key: `final-vote:${stance}`,
                    success:
                      stance === "for"
                        ? "Your final vote is recorded FOR the motion."
                        : "Your final vote is recorded AGAINST the motion.",
                  }
                )
              }
              className={`rounded-xl border-2 p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-brand disabled:cursor-not-allowed disabled:opacity-50 ${
                room.userFinalVote === stance
                  ? "border-gold bg-surface"
                  : "border-transparent bg-surface hover:border-green-wash-border"
              }`}
            >
              <SideMark stance={stance} long />
              <span className="mt-2 block text-2xl font-bold text-ink">
                {stance === "for"
                  ? room.debate.forVotes
                  : room.debate.againstVotes}{" "}
                votes
              </span>
            </button>
          ))}
        </div>
        {!room.currentUserId ? (
          <p className="mt-3 text-sm text-ink-muted">
            <Link
              href={`/login?redirectTo=/debates/${room.debate.id}`}
              className="font-semibold text-emerald-brand underline"
            >
              Sign in
            </Link>{" "}
            to cast your final vote.
          </p>
        ) : deadlinePassed ? (
          <p className="mt-3 text-sm font-semibold text-red-700">
            The final voting window has closed.
          </p>
        ) : null}
        <div className="mt-5">
          <div className="flex justify-between text-sm font-bold text-ink">
            <span>FOR {forPercent}%</span>
            <span>AGAINST {againstPercent}%</span>
          </div>
          <div
            role="img"
            aria-label={
              total
                ? `Current vote: ${forPercent}% for and ${againstPercent}% against`
                : "No final votes have been cast yet"
            }
            className="mt-2 flex h-3 overflow-hidden rounded-full bg-gray-200"
          >
            <span
              className="bg-emerald-brand"
              style={{ width: `${forPercent}%` }}
            />
            <span
              className="bg-purple-accent"
              style={{ width: `${againstPercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-ink-muted">{total} final votes cast</p>
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-bold text-ink">
          Arguments on record
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Upvote clarity and evidence separately from your final vote.
        </p>
        <div className="mt-5 space-y-5">
          {(["opening", "rebuttal"] as const).map((phase) => (
            <div key={phase}>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-ink-muted">
                {phase}
              </h3>
              <ArgumentColumns
                phase={phase}
                argumentsForPhase={room.arguments.filter(
                  (argument) => argument.phase === phase
                )}
                deadlinePassed
                room={room}
                pending={pending}
                onUpvote={(id) =>
                  mutate(
                    () => toggleArgumentUpvoteV15Action(room.debate.id, id),
                    { key: `upvote:${id}` }
                  )
                }
              />
            </div>
          ))}
        </div>
      </section>

      {room.isManager ? (
        <section className="rounded-2xl border border-gold bg-gold-tint p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold-ink">
            Voting outreach and close
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton
              tone="secondary"
              disabled={pending === "remind-voters" || reminded}
              onClick={() =>
                mutate(
                  async () => {
                    const result = await remindVotersV15Action(room.debate.id);
                    if (result.ok) setReminded(true);
                    return result;
                  },
                  {
                    key: "remind-voters",
                    success: "Voting reminder sent to the debate's audience.",
                  }
                )
              }
            >
              {pending === "remind-voters"
                ? "Sending…"
                : reminded
                  ? "Reminder sent"
                  : "Remind voters"}
            </ActionButton>
            <ActionButton
              tone="gold"
              onClick={() => setCloseOpen(true)}
            >
              Close debate
            </ActionButton>
          </div>
        </section>
      ) : null}

      <ManagerControls room={room} pending={pending} mutate={mutate} />

      {closeOpen ? (
        <Modal title="Close voting and publish verdict?" close={() => setCloseOpen(false)}>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            The current community vote becomes the final verdict. The
            AI-assisted recap will then begin generating.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <ActionButton tone="quiet" onClick={() => setCloseOpen(false)}>
              Keep voting open
            </ActionButton>
            <ActionButton
              tone="gold"
              disabled={pending === "complete"}
              onClick={() => {
                mutate(() => completeDebateV15Action(room.debate.id), {
                  key: "complete",
                  success:
                    "Voting is closed and the verdict is published. The recap is now generating.",
                });
                setCloseOpen(false);
              }}
            >
              Publish verdict
            </ActionButton>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function SourceList({ sources }: { sources: DebateV15Source[] }) {
  if (!sources.length) {
    return <p className="text-sm text-ink-muted">No sources were cited.</p>;
  }
  return (
    <ul className="space-y-2">
      {sources.map((source) => (
        <li key={source.id}>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-sm font-semibold text-emerald-brand underline underline-offset-4"
          >
            {source.title || source.url}
          </a>
        </li>
      ))}
    </ul>
  );
}

function VerdictView({
  room,
  pending,
  mutate,
}: {
  room: DebateV15RoomData;
  pending: string | null;
  mutate: DebateV15Mutate;
}) {
  const { total, forPercent, againstPercent, outcome } =
    resolveDebateV15Verdict(
      room.debate.forVotes,
      room.debate.againstVotes
    );
  const verdictTitle =
    outcome === "no_votes"
      ? "No final votes were cast"
      : outcome === "tied"
        ? `Community vote tied — ${forPercent}% to ${againstPercent}%`
        : outcome === "for"
          ? `FOR wins — ${forPercent}% to ${againstPercent}%`
          : `AGAINST wins — ${againstPercent}% to ${forPercent}%`;
  const sources = Array.from(
    new Map(
      room.arguments
        .flatMap((argument) => argument.sources)
        .map((source) => [source.url, source])
    ).values()
  );
  const participants = room.slots.filter(
    (slot) => slot.status === "accepted"
  );
  const recapReady =
    room.debate.recapStatus === "ready" ||
    Boolean(
      room.debate.recapKeyDisagreement ||
        room.debate.recapAgreement ||
        room.debate.recapText
    );

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl bg-emerald-brand text-white">
        <div className="p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">
            Community verdict
          </p>
          <h2 className="mt-2 font-display text-4xl font-bold">
            {verdictTitle}
          </h2>
          <p className="mt-2 text-sm text-white/70">
            {total} final {total === 1 ? "vote" : "votes"} cast
          </p>
          {total ? (
            <>
              <div
                role="img"
                aria-label={`Final verdict: ${forPercent}% for and ${againstPercent}% against`}
                className="mt-5 flex h-4 overflow-hidden rounded-full bg-purple-accent"
              >
                <span
                  className="bg-gold"
                  style={{ width: `${forPercent}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs font-bold">
                <span>+ FOR</span>
                <span>− AGAINST</span>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-white/70">
              The debate is archived without a community verdict split.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-green-wash-border bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-purple-accent">
              AI-assisted recap
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold text-ink">
              What the debate revealed
            </h2>
          </div>
          <span className="rounded-full bg-purple-tint px-3 py-1 text-xs font-semibold text-purple-accent">
            AI summarises; votes decide
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          This recap organises the arguments. It did not determine the
          community verdict above.
        </p>

        {recapReady ? (
          <div className="mt-5">
            {room.debate.recapText ? (
              <article className="rounded-xl border border-purple-tint bg-purple-tint/40 p-5">
                <h3 className="font-display text-xl font-bold text-ink">
                  Debate recap
                </h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink">
                  {room.debate.recapText}
                </p>
              </article>
            ) : null}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <RecapBlock
                title="Key disagreement"
                text={
                  room.debate.recapKeyDisagreement ??
                  "The recap did not identify one central disagreement."
                }
              />
              <RecapBlock
                title="Areas of agreement"
                text={
                  room.debate.recapAgreement ??
                  "No clear area of agreement was identified."
                }
              />
              <RecapBlock
                stance="for"
                title="Strongest — FOR"
                text={
                  room.debate.recapStrongestFor ??
                  "No strongest FOR argument was identified."
                }
              />
              <RecapBlock
                stance="against"
                title="Strongest — AGAINST"
                text={
                  room.debate.recapStrongestAgainst ??
                  "No strongest AGAINST argument was identified."
                }
              />
            </div>
          </div>
        ) : room.debate.recapStatus === "failed" ? (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4"
          >
            <p className="font-semibold text-red-700">
              {room.debate.recapError || "The recap could not be generated."}
            </p>
            <p className="mt-1 text-sm text-red-700">
              The verdict and arguments remain complete and readable.
            </p>
            {room.isManager ? (
              <ActionButton
                tone="danger"
                className="mt-3"
                disabled={pending === "retry-recap"}
                onClick={() =>
                  mutate(() => retryDebateRecapV15Action(room.debate.id), {
                    key: "retry-recap",
                    success: "Recap generation has been queued again.",
                  })
                }
              >
                {pending === "retry-recap" ? "Queueing…" : "Retry recap"}
              </ActionButton>
            ) : null}
          </div>
        ) : (
          <div
            role="status"
            className="mt-5 rounded-xl border border-purple-tint bg-purple-tint p-4 text-sm text-purple-accent"
          >
            {room.debate.recapStatus === "generating"
              ? "The AI-assisted recap is being generated. The verdict is already final."
              : "The recap is queued for generation. The verdict is already final."}
            <RecapPoller />
          </div>
        )}
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-green-wash-border bg-surface p-5">
          <h2 className="font-display text-xl font-bold text-ink">
            Sources cited
          </h2>
          <div className="mt-3">
            <SourceList sources={sources} />
          </div>
        </section>
        <section className="rounded-2xl border border-green-wash-border bg-surface p-5">
          <h2 className="font-display text-xl font-bold text-ink">
            Participants
          </h2>
          <ul className="mt-3 space-y-3">
            {participants.map((slot) => (
              <li
                key={slot.stance}
                className="flex items-center justify-between gap-3"
              >
                <ProfileBadge profile={slot.profile} />
                <SideMark stance={slot.stance} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      {room.relatedDebates.length ? (
        <section className="rounded-2xl border border-green-wash-border bg-surface p-5">
          <h2 className="font-display text-xl font-bold text-ink">
            Related debates
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {room.relatedDebates.map((related) => {
              const relatedTotal = related.forVotes + related.againstVotes;
              const relatedFor = relatedTotal
                ? Math.round((related.forVotes / relatedTotal) * 100)
                : 50;
              return (
                <Link
                  key={related.id}
                  href={`/debates/${related.id}`}
                  className="rounded-xl bg-green-wash p-4 transition hover:bg-green-tint"
                >
                  <span className="line-clamp-2 text-sm font-semibold text-ink">
                    {related.title}
                  </span>
                  <span className="mt-2 block text-xs text-ink-muted">
                    {relatedTotal
                      ? `FOR ${relatedFor}% · ${relatedTotal} votes`
                      : "No final votes"}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RecapBlock({
  title,
  text,
  stance,
}: {
  title: string;
  text: string;
  stance?: DebateV15Stance;
}) {
  return (
    <article
      className={`rounded-xl p-4 ${
        stance === "for"
          ? "bg-green-tint"
          : stance === "against"
            ? "bg-purple-tint"
            : "bg-green-wash"
      }`}
    >
      <h3 className="text-sm font-bold text-ink">
        {stance ? (
          <span className="mb-2 block">
            <SideMark stance={stance} />
          </span>
        ) : null}
        {title}
      </h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-muted">
        {text}
      </p>
    </article>
  );
}

function CancelledView({
  room,
  pending,
  mutate,
}: {
  room: DebateV15RoomData;
  pending: string | null;
  mutate: DebateV15Mutate;
}) {
  return (
    <div className="space-y-5">
      <section
        role="status"
        className="rounded-2xl border border-red-200 bg-red-50 p-5"
      >
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-700">
          Cancelled — not completed
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold text-ink">
          This debate was cancelled by the moderator.
        </h2>
        <p className="mt-2 text-sm leading-6 text-red-700">
          {room.debate.cancellationReason || "No reason was provided."}{" "}
          Submitted arguments remain visible below.
        </p>
      </section>

      {room.arguments.length ? (
        <section>
          <h2 className="font-display text-2xl font-bold text-ink">
            Arguments submitted before cancellation
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {room.arguments.map((argument) => (
              <ArgumentCard
                key={argument.id}
                argument={argument}
                upvoted={room.userUpvotedArgumentIds.includes(argument.id)}
                canUpvote={false}
                busy={pending === `upvote:${argument.id}`}
                onUpvote={(id) =>
                  mutate(
                    () => toggleArgumentUpvoteV15Action(room.debate.id, id),
                    { key: `upvote:${id}` }
                  )
                }
              />
            ))}
          </div>
        </section>
      ) : (
        <p className="rounded-xl bg-green-wash p-5 text-sm text-ink-muted">
          No arguments were submitted before cancellation.
        </p>
      )}
    </div>
  );
}

export default function DebateV15Room({
  room,
}: {
  room: DebateV15RoomData;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Which action is in flight, not merely whether one is. A single boolean
  // disabled every control in the room on any request, so upvoting an
  // argument greyed out the composer and the moderator's phase controls.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const pending = isPending ? pendingKey : null;
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<number | null>(null);
  const now = useClockTick(room.loadedAt);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const activeDeadline = deadlineForPhase(room, room.debate.phase);
  const moderatorName = profileName(room.debate.moderator);

  const mutate: DebateV15Mutate = (action, options = {}) => {
    setFeedback(null);
    setPendingKey(options.key ?? "action");
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setFeedback({
            tone: "error",
            message: result.message ?? "That action could not be completed.",
          });
          return;
        }

        options.onSuccess?.();

        // A server-authored message (e.g. invitation delivery) always wins;
        // otherwise use the caller's copy. With neither, the action succeeds
        // quietly rather than announcing a meaningless "Saved."
        const message = result.message ?? options.success ?? null;
        setFeedback(message ? { tone: "success", message } : null);
        router.refresh();
      } finally {
        setPendingKey(null);
      }
    });
  };

  useRoomLiveSync(
    room,
    room.debate.status === "cancelled" || room.debate.phase === "completed",
    () => {
      setLiveUpdatedAt(Date.now());
      router.refresh();
    }
  );

  // The banner sits at the top of a long room; actions are triggered from the
  // bottom of it (composer, vote panel). Without moving the viewport, a failed
  // submission would report itself entirely off-screen on a phone.
  useEffect(() => {
    if (!feedback) return;
    const node = feedbackRef.current;
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.focus({ preventScroll: true });
  }, [feedback]);

  // The live-sync notice is an acknowledgement, not a state the room stays
  // in -- the refreshed content is the real message.
  useEffect(() => {
    if (!liveUpdatedAt) return;
    const timer = window.setTimeout(() => setLiveUpdatedAt(null), 5000);
    return () => window.clearTimeout(timer);
  }, [liveUpdatedAt]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setFeedback({ tone: "success", message: "Debate link copied." });
    } catch {
      setFeedback({
        tone: "error",
        message: "Could not copy the link. Use your browser address bar.",
      });
    }
  };

  return (
    <div className="-mx-4 min-h-screen bg-canvas sm:-mx-6 lg:-mx-8">
      <header className="sticky top-[var(--app-nav-offset)] z-30 border-b border-green-wash-border bg-surface/95 px-4 py-3 backdrop-blur transition-[top] duration-200 ease-out motion-reduce:transition-none sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/debates"
              className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-brand hover:underline"
            >
              ← Debates
            </Link>
            <p className="truncate text-sm font-semibold text-ink">
              {room.debate.title}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {activeDeadline && room.debate.status !== "cancelled" ? (
              <span className="flex flex-col items-end text-xs leading-tight">
                {/* The countdown is the part a debater actually acts on, so
                    it stays visible on phones; the absolute timestamp is
                    supporting detail and drops away on narrow screens. */}
                <DeadlineCountdown value={activeDeadline} />
                <span className="hidden text-ink-faint sm:block">
                  <LocalDeadline value={activeDeadline} compact />
                </span>
              </span>
            ) : null}
            <ActionButton tone="secondary" onClick={share}>
              Share
            </ActionButton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {liveUpdatedAt ? (
          <p
            role="status"
            className="mb-4 inline-flex items-center gap-2 rounded-full bg-green-tint px-3 py-1.5 text-xs font-semibold text-emerald-brand"
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-emerald-brand"
            />
            This room just updated.
          </p>
        ) : null}

        {feedback ? (
          <div
            ref={feedbackRef}
            tabIndex={-1}
            role={feedback.tone === "error" ? "alert" : "status"}
            className={`mb-5 flex items-start justify-between gap-3 rounded-xl border p-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand focus-visible:ring-offset-2 ${
              feedback.tone === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-wash-border bg-green-tint text-emerald-brand"
            }`}
          >
            <span>{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              aria-label="Dismiss message"
              className="shrink-0 rounded-lg px-2 py-0.5 text-base leading-none hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            >
              ×
            </button>
          </div>
        ) : null}

        <section className="mb-5 overflow-hidden rounded-2xl border border-green-wash-border bg-surface">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-green-tint px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-brand">
                Curated 1v1
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                  room.debate.status === "cancelled"
                    ? "bg-red-50 text-red-700"
                    : "bg-gold-tint text-gold-ink"
                }`}
              >
                {room.debate.status === "cancelled"
                  ? "Cancelled"
                  : PHASES.find((item) => item.key === room.debate.phase)
                      ?.label}
              </span>
            </div>
            <h1 className="mt-4 max-w-4xl font-display text-3xl font-bold leading-tight text-ink sm:text-5xl">
              {room.debate.title}
            </h1>
            {room.debate.description ? (
              <p className="mt-4 max-w-3xl text-base leading-7 text-ink-muted">
                {room.debate.description}
              </p>
            ) : null}
            {room.debate.tags.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {room.debate.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-green-wash px-2.5 py-1 text-xs font-semibold text-ink-muted"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-green-wash-border pt-4 text-xs text-ink-muted">
              <span>Moderated by {moderatorName}</span>
              <span>{room.arguments.length}/4 arguments submitted</span>
            </div>
          </div>
        </section>

        {room.debate.status !== "cancelled" ? (
          <div className="mb-6">
            <PhaseProgress phase={room.debate.phase} />
          </div>
        ) : null}

        <RoomGuidanceCallout room={room} now={now} />

        {room.debate.status === "cancelled" ? (
          <CancelledView room={room} pending={pending} mutate={mutate} />
        ) : room.debate.phase === "recruiting" ? (
          <RecruitingView room={room} pending={pending} mutate={mutate} />
        ) : room.debate.phase === "opening" ||
          room.debate.phase === "rebuttal" ? (
          <ActiveArgumentView
            room={room}
            phase={room.debate.phase}
            pending={pending}
            mutate={mutate}
          />
        ) : room.debate.phase === "voting" ? (
          <VotingView room={room} pending={pending} mutate={mutate} />
        ) : (
          <VerdictView room={room} pending={pending} mutate={mutate} />
        )}
      </main>
    </div>
  );
}
