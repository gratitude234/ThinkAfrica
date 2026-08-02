"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import {
  DebateStatusPill,
  PhasePill,
  PhaseStepper,
  StatTile,
} from "../DebatePrimitives";

type AccessState =
  | { status: "checking" }
  | { status: "guest" }
  | { status: "blocked"; reason: string }
  | { status: "allowed" };

type DeadlineKey =
  | "recruiting"
  | "opening"
  | "rebuttal"
  | "voting";

type DebateSchedule = Record<DeadlineKey, string>;

const EMPTY_SCHEDULE: DebateSchedule = {
  recruiting: "",
  opening: "",
  rebuttal: "",
  voting: "",
};

type SchedulePreset = {
  id: "balanced" | "focused" | "fast";
  name: string;
  detail: string;
  cumulativeDays: [number, number, number, number];
};

const SCHEDULE_PRESETS: SchedulePreset[] = [
  {
    id: "balanced",
    name: "Balanced",
    detail: "3 days to recruit, then 2 days per stage",
    cumulativeDays: [3, 5, 7, 9],
  },
  {
    id: "focused",
    name: "Focused week",
    detail: "2 days to recruit, then 1 day per stage",
    cumulativeDays: [2, 3, 4, 5],
  },
  {
    id: "fast",
    name: "Fast pilot",
    detail: "1 day for every stage",
    cumulativeDays: [1, 2, 3, 4],
  },
];

const DEADLINE_FIELDS: Array<{
  key: DeadlineKey;
  label: string;
  help: string;
}> = [
  {
    key: "recruiting",
    label: "Recruiting closes",
    help: "Invite one FOR and one AGAINST debater before this time.",
  },
  {
    key: "opening",
    label: "Opening arguments close",
    help: "Each confirmed debater submits one final opening argument.",
  },
  {
    key: "rebuttal",
    label: "Rebuttals close",
    help: "Each debater submits one final response to the other side.",
  },
  {
    key: "voting",
    label: "Community voting closes",
    help: "The moderator closes the vote and publishes the verdict.",
  },
];

function parseTags(input: string) {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function toLocalDateTimeInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function scheduleFromPreset(preset: SchedulePreset): DebateSchedule {
  const base = new Date();
  base.setSeconds(0, 0);
  base.setMinutes(Math.ceil(base.getMinutes() / 15) * 15);

  const atDay = (days: number) =>
    toLocalDateTimeInput(
      new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
    );

  return {
    recruiting: atDay(preset.cumulativeDays[0]),
    opening: atDay(preset.cumulativeDays[1]),
    rebuttal: atDay(preset.cumulativeDays[2]),
    voting: atDay(preset.cumulativeDays[3]),
  };
}

function getScheduleError(schedule: DebateSchedule) {
  const timestamps = DEADLINE_FIELDS.map(({ key }) =>
    new Date(schedule[key]).getTime()
  );

  if (timestamps.some((value) => !Number.isFinite(value))) {
    return "Choose a date and time for every stage.";
  }
  if (timestamps[0] <= Date.now()) {
    return "The recruiting deadline must be in the future.";
  }
  if (
    timestamps[1] <= timestamps[0] ||
    timestamps[2] <= timestamps[1] ||
    timestamps[3] <= timestamps[2]
  ) {
    return "Deadlines must stay in order: recruiting, opening, rebuttal, then voting.";
  }
  return null;
}

function resolveCreatedDebateId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return resolveCreatedDebateId(value[0]);
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const candidate = record.debate_id ?? record.id;
  return typeof candidate === "string" ? candidate : null;
}

function formatDeadline(value: string) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function AccessCard({
  eyebrow,
  title,
  body,
  actions,
}: {
  eyebrow: string;
  title: string;
  body: string;
  actions: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-xl border border-gray-200 bg-surface p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-brand">
          {eyebrow}
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">
          {title}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">
          {body}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>
      </div>
    </div>
  );
}

export default function CreateDebatePage() {
  const router = useRouter();
  const [access, setAccess] = useState<AccessState>({ status: "checking" });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [presetId, setPresetId] = useState<SchedulePreset["id"] | null>(
    "balanced"
  );
  const [schedule, setSchedule] =
    useState<DebateSchedule>(EMPTY_SCHEDULE);
  const [timezone, setTimezone] = useState("your local timezone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Opening the new debate room is a separate wait from creating it. The
  // finally block below clears `loading` as soon as the RPC returns, so
  // without this the button went idle while the room was still loading.
  const [isOpeningRoom, startOpeningRoom] = useTransition();

  const parsedTags = useMemo(() => parseTags(tags), [tags]);
  const scheduleError = getScheduleError(schedule);
  const tagsError =
    parsedTags.length > 6
      ? "Use no more than 6 tags."
      : parsedTags.some((tag) => tag.length > 40)
        ? "Keep every tag to 40 characters or fewer."
        : null;
  const canSubmit =
    title.trim().length >= 10 &&
    title.trim().length <= 160 &&
    description.trim().length >= 30 &&
    description.trim().length <= 900 &&
    !tagsError &&
    !scheduleError;

  useEffect(() => {
    let mounted = true;

    async function loadAccess() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;
      setSchedule(scheduleFromPreset(SCHEDULE_PRESETS[0]));
      setTimezone(
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
          "your local timezone"
      );
      if (!user) {
        setAccess({ status: "guest" });
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("verified, role")
        .eq("id", user.id)
        .maybeSingle();

      const canCreate =
        Boolean(profile?.verified) ||
        profile?.role === "editor" ||
        profile?.role === "admin";

      setAccess(
        canCreate
          ? { status: "allowed" }
          : {
              status: "blocked",
              reason:
                "Debates are started by verified contributors so each motion has a clear moderator.",
            }
      );
    }

    void loadAccess();
    return () => {
      mounted = false;
    };
  }, []);

  function applyPreset(preset: SchedulePreset) {
    setPresetId(preset.id);
    setSchedule(scheduleFromPreset(preset));
    setError(null);
  }

  function updateDeadline(key: DeadlineKey, value: string) {
    setPresetId(null);
    setSchedule((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (access.status !== "allowed") return;

    const validationError = getScheduleError(schedule);
    if (title.trim().length < 10) {
      setError("Write a motion of at least 10 characters.");
      return;
    }
    if (description.trim().length < 30) {
      setError(
        "Add at least 30 characters of context so both sides share the same frame."
      );
      return;
    }
    if (tagsError) {
      setError(tagsError);
      return;
    }
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "create_debate_v1_5",
        {
          p_title: title.trim(),
          p_description: description.trim(),
          p_tags: parsedTags,
          p_recruiting_deadline: new Date(schedule.recruiting).toISOString(),
          p_opening_deadline: new Date(schedule.opening).toISOString(),
          p_rebuttal_deadline: new Date(schedule.rebuttal).toISOString(),
          p_voting_deadline: new Date(schedule.voting).toISOString(),
        }
      );

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      const debateId = resolveCreatedDebateId(data);
      if (!debateId) {
        setError("The debate was created, but its room could not be opened.");
        return;
      }

      startOpeningRoom(() => {
        router.push(`/debates/${debateId}`);
        router.refresh();
      });
    } catch {
      setError("The debate could not be created. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (access.status === "checking") {
    return (
      <div className="mx-auto max-w-5xl animate-pulse motion-reduce:animate-none">
        <div className="h-9 w-72 rounded bg-gray-200" />
        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-[580px] rounded-xl bg-surface" />
          <div className="h-80 rounded-xl bg-surface" />
        </div>
      </div>
    );
  }

  if (access.status === "guest") {
    return (
      <AccessCard
        eyebrow="Start a debate"
        title="Sign in to frame a motion"
        body="A debate needs an accountable moderator who can invite both sides and guide each stage."
        actions={
          <Link
            href="/login?redirectTo=/debates/create"
            className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Sign in
          </Link>
        }
      />
    );
  }

  if (access.status === "blocked") {
    return (
      <AccessCard
        eyebrow="Verified moderators"
        title="Get verified to start debates"
        body={access.reason}
        actions={
          <>
            <Link
              href="/settings"
              className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Complete profile
            </Link>
            <Link
              href="/debates"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-ink hover:bg-canvas"
            >
              Browse debates
            </Link>
          </>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-brand">
            Curated 1v1 debate
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-ink md:text-4xl">
            Frame the motion and its schedule
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
            You will invite one debater for each side. The debate stays
            asynchronous, and you advance every stage when the room is ready.
          </p>
        </div>
        <Link
          href="/debates"
          className="inline-flex w-fit rounded-lg border border-gray-200 bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-canvas"
        >
          Browse debates
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-gray-200 bg-surface p-5 sm:p-6"
        >
          <section>
            <h2 className="text-base font-semibold text-ink">Motion details</h2>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              Make the claim clear enough that readers immediately understand
              what FOR and AGAINST mean.
            </p>

            <div className="mt-5 space-y-5">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label htmlFor="debate-title" className="text-sm font-semibold text-ink">
                    Motion <span className="text-red-600">*</span>
                  </label>
                  <span className="text-xs text-ink-muted">
                    {title.trim().length}/160
                  </span>
                </div>
                <input
                  id="debate-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  minLength={10}
                  maxLength={160}
                  placeholder="e.g. African cities should make public transport free"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-ink focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label htmlFor="debate-context" className="text-sm font-semibold text-ink">
                    Context <span className="text-red-600">*</span>
                  </label>
                  <span className="text-xs text-ink-muted">
                    {description.trim().length}/900
                  </span>
                </div>
                <textarea
                  id="debate-context"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={5}
                  required
                  minLength={30}
                  maxLength={900}
                  placeholder="Explain why the motion matters and what both sides should focus on."
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm leading-6 text-ink focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
                />
                <p className="mt-1 text-xs text-ink-muted">
                  Give both debaters the same scope and assumptions (30
                  characters minimum).
                </p>
              </div>

              <div>
                <label htmlFor="debate-tags" className="mb-1.5 block text-sm font-semibold text-ink">
                  Tags
                </label>
                <input
                  id="debate-tags"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="policy, cities, transport"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-ink focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
                />
                <p className="mt-1 text-xs text-ink-muted">
                  Up to 6 comma-separated tags.
                </p>
                {tagsError ? (
                  <p className="mt-1 text-xs text-red-600">{tagsError}</p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="mt-7 border-t border-gray-100 pt-6">
            <h2 className="text-base font-semibold text-ink">Choose a schedule</h2>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              Start with a preset, then adjust any deadline. All times below
              use {timezone}.
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {SCHEDULE_PRESETS.map((preset) => {
                const selected = presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => applyPreset(preset)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      selected
                        ? "border-emerald-brand bg-green-tint ring-2 ring-green-wash-border"
                        : "border-gray-200 bg-surface hover:border-emerald-brand"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-ink">
                      {preset.name}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-ink-muted">
                      {preset.detail}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 space-y-4">
              {DEADLINE_FIELDS.map((field, index) => (
                <div
                  key={field.key}
                  className="grid gap-2 rounded-xl border border-gray-100 bg-canvas p-3 sm:grid-cols-[36px_minmax(0,1fr)_220px] sm:items-center"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-brand text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <label
                      htmlFor={`${field.key}-deadline`}
                      className="text-sm font-semibold text-ink"
                    >
                      {field.label}
                    </label>
                    <p className="mt-0.5 text-xs leading-5 text-ink-muted">
                      {field.help}
                    </p>
                  </div>
                  <input
                    id={`${field.key}-deadline`}
                    type="datetime-local"
                    value={schedule[field.key]}
                    onChange={(event) =>
                      updateDeadline(field.key, event.target.value)
                    }
                    required
                    step={60}
                    className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-ink focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
                  />
                </div>
              ))}
            </div>

            {scheduleError ? (
              <p className="mt-3 text-sm text-red-600">{scheduleError}</p>
            ) : null}
          </section>

          {error ? (
            <div
              role="alert"
              className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
            <Button
              type="submit"
              loading={loading || isOpeningRoom}
              disabled={!canSubmit}
            >
              {isOpeningRoom ? "Opening the room…" : "Create and recruit debaters"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>

        <aside className="space-y-4 transition-[top] duration-200 ease-out motion-reduce:transition-none lg:sticky lg:top-[calc(var(--app-nav-offset)+1rem)] lg:self-start">
          <section className="rounded-xl border border-gray-200 bg-surface p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <DebateStatusPill status="open" />
              <PhasePill phase="recruiting" />
            </div>
            <h2 className="font-display text-lg font-semibold leading-tight text-ink">
              {title.trim() || "Your debate motion will appear here"}
            </h2>
            <p className="mt-2 line-clamp-4 text-sm leading-6 text-ink-muted">
              {description.trim() ||
                "Add context so invited debaters know what makes a relevant argument."}
            </p>
            {parsedTags.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {parsedTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-ink-muted"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-gray-200 bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
              Debate journey
            </p>
            <div className="mt-4">
              <PhaseStepper
                currentPhase="recruiting"
                status="open"
                variant="v1_5"
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <StatTile label="Debaters" value="1 vs 1" tone="emerald" />
              <StatTile label="Progression" value="Manual" tone="amber" />
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
              Schedule preview
            </p>
            <ol className="mt-3 space-y-3">
              {DEADLINE_FIELDS.map((field) => (
                <li key={field.key}>
                  <p className="text-xs font-semibold text-ink">{field.label}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {formatDeadline(schedule[field.key])}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
