"use client";

/**
 * Debate V2 Phase 3: the orchestrating Client Component for a V2 room.
 *
 * Owns the room state, the refresh-after-mutation path, and a lightweight,
 * visibility-aware polling loop -- realtime is not assumed to work (see
 * lib/realtime.ts's shouldUseRealtime and docs/debate-v2-product-contract.md),
 * so this is the sole live-update mechanism for a V2 debate. Polling never
 * overlaps itself, is paused while the tab is hidden, and stops entirely
 * once the debate closes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/utils";
import type { DebateRoundPhase } from "@/lib/debateV2";
import { isActiveRoundDue, isFinalBallotWindowOpen, isInitialBallotWindowOpen, type ArgumentEntryTypeV2 } from "@/lib/debateV2Lifecycle";
import { roomSignalsDiffer, type RoomSignalLike } from "@/lib/debateV2Ui";
import DebateCountdown from "../DebateCountdown";
import ShareButton from "../ShareButton";
import { ROUND_PHASE_LABELS, ROUND_PHASE_PURPOSE } from "./labels";
import V2RoundProgress from "./V2RoundProgress";
import V2Lobby from "./V2Lobby";
import V2BallotPanel, { V2BallotResultsBar } from "./V2BallotPanel";
import V2ArgumentComposer from "./V2ArgumentComposer";
import V2ArgumentCard from "./V2ArgumentCard";
import V2CrossExamination from "./V2CrossExamination";
import V2ModeratorControls from "./V2ModeratorControls";
import V2SubscriptionControl from "./V2SubscriptionControl";
import { loadDebateV2Room } from "./loadRoomData";
import { loadDebateV2RoomSignal } from "./loadRoomSignal";
import type { DebateV2ArgumentView, DebateV2BallotResults, DebateV2DebateSummary, DebateV2RoomView } from "./types";

const POLL_INTERVAL_MS = 15000;

const SUBMISSION_PHASES: readonly DebateRoundPhase[] = ["opening", "rebuttal", "closing"];
function isSubmissionPhase(phase: DebateRoundPhase): phase is ArgumentEntryTypeV2 {
  return (SUBMISSION_PHASES as readonly string[]).includes(phase);
}

function StatusBadge({ status, closureKind }: { status: DebateV2DebateSummary["status"]; closureKind: DebateV2DebateSummary["closureKind"] }) {
  if (status === "open") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
        Open lobby
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
        <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
        Live
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
      Closed{closureKind === "forced" ? " early" : ""}
    </span>
  );
}

function ClosedSummary({
  debate,
  initialResults,
  finalResults,
}: {
  debate: DebateV2DebateSummary;
  initialResults: DebateV2BallotResults | null;
  finalResults: DebateV2BallotResults | null;
}) {
  const bothVisible = initialResults !== null && finalResults !== null && initialResults.total > 0 && finalResults.total > 0;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
        {debate.closureKind === "forced" ? "Debate force-closed" : "Debate completed"}
      </p>
      <p className="mt-1 text-xs leading-5 text-gray-500">
        {debate.closureKind === "forced"
          ? "A moderator ended this debate before final voting completed normally."
          : "This debate ran its full course through final voting."}
      </p>

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold text-gray-700">Final result</p>
        {finalResults ? (
          <V2BallotResultsBar results={finalResults} />
        ) : (
          <p className="text-xs text-gray-400">Final results are not available for this debate.</p>
        )}
      </div>

      {/* Opinion movement is shown as plain before/after numbers only --
          the product contract defines no winner-determination algorithm,
          so this deliberately never declares a "winner". */}
      {bothVisible ? (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="mb-1.5 text-xs font-semibold text-gray-700">Opinion movement</p>
          <p className="text-xs leading-5 text-gray-500">
            Initial: {Math.round((initialResults!.forCount / initialResults!.total) * 100)}% for,{" "}
            {Math.round((initialResults!.againstCount / initialResults!.total) * 100)}% against
            <br />
            Final: {Math.round((finalResults!.forCount / finalResults!.total) * 100)}% for,{" "}
            {Math.round((finalResults!.againstCount / finalResults!.total) * 100)}% against
          </p>
        </div>
      ) : null}
    </section>
  );
}

export default function DebateV2Room({ debateId, initialRoom }: { debateId: string; initialRoom: DebateV2RoomView }) {
  const [room, setRoom] = useState(initialRoom);
  const [selectedParent, setSelectedParent] = useState<DebateV2ArgumentView | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  // Baseline for the next poll tick's comparison. null means "no known-fresh
  // baseline to diff against" -- either no full reload has completed yet
  // since mount, or the last poll attempt failed and never committed one
  // (see poll() below). Either way, the next poll tick treats that as
  // "unknown, assume something may have changed" and forces one full reload
  // rather than silently adopting whatever it sees as a false "nothing
  // changed" baseline. refresh() also resets this to null on success, so
  // the next poll tick establishes its own baseline from that known-fresh
  // state instead of comparing against a signal snapshot from before it.
  const lastSignalRef = useRef<RoomSignalLike | null>(null);

  const refresh = useCallback(async () => {
    try {
      const fresh = await loadDebateV2Room(debateId);
      if (fresh) {
        setRoom(fresh);
        setRefreshError(false);
        lastSignalRef.current = null;
      }
    } catch {
      setRefreshError(true);
    }
  }, [debateId]);

  // Live updates: no realtime subscription is assumed to work for V2 (see
  // module comment above). Every viewer of an active debate reloading the
  // full room (arguments, sources, reactions, memberships, two ballot-result
  // RPCs) on a flat interval doesn't scale -- see loadRoomSignal.ts. So each
  // tick instead runs the much cheaper loadDebateV2RoomSignal, and only pays
  // for a full loadDebateV2Room when roomSignalsDiffer() says something a
  // viewer could see actually changed. Never let two fetches run
  // concurrently; stop entirely once the debate is closed (its state cannot
  // change again) or while the tab is hidden.
  useEffect(() => {
    if (room.debate.status === "closed") return;

    let cancelled = false;
    let inFlight = false;

    async function poll() {
      if (inFlight || cancelled || document.hidden) return;
      inFlight = true;
      try {
        const signal = await loadDebateV2RoomSignal(debateId);
        if (!signal || cancelled) return;

        const previous = lastSignalRef.current;
        // previous === null means this is the first tick since mount (or
        // since the last full reload) -- there is no earlier signal to
        // diff against, and anything could have changed between the
        // initial SSR render and now, so this always does one full reload
        // rather than silently adopting whatever the first signal happens
        // to show as a false "nothing changed" baseline.
        const needsReload = previous === null || roomSignalsDiffer(previous, signal);

        if (needsReload) {
          const fresh = await loadDebateV2Room(debateId);
          if (cancelled) return;
          // A signal fetch that just succeeded already confirmed this
          // debate exists and is still format_version 2, so a null result
          // here means the reload this tick required didn't actually land
          // -- treated the same as a thrown error (below), not silently
          // accepted as "up to date", so the baseline isn't committed and
          // the next tick retries instead of masking the miss.
          if (!fresh) throw new Error("loadDebateV2Room returned null during a triggered poll reload");
          setRoom(fresh);
        }

        // Only commit the new baseline (and clear a stale error notice)
        // once everything this tick needed has actually succeeded. If the
        // full reload above throws, control jumps straight to the catch
        // block below and never reaches here -- lastSignalRef.current keeps
        // pointing at the OLD baseline, so next tick's signal still looks
        // "changed" relative to it and the reload is retried, instead of
        // this tick's (successfully fetched, but never actually applied)
        // signal being silently adopted as if the reload it was gating had
        // succeeded.
        lastSignalRef.current = signal;
        setRefreshError(false);
      } catch {
        // A real failure (the signal fetch itself, or a reload it
        // triggered) -- surfaced, since retry now depends on the baseline
        // staying put; a poll that silently "succeeded" without applying
        // its reload would otherwise go undetected indefinitely.
        setRefreshError(true);
      } finally {
        inFlight = false;
      }
    }

    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    function onVisibilityChange() {
      if (!document.hidden) void poll();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [debateId, room.debate.status]);

  const { debate, rounds, activeRound, membershipCounts, currentUser, arguments: allArguments, ballotResults } = room;

  const argumentsByRound = useMemo(() => {
    const map = new Map<string, DebateV2ArgumentView[]>();
    for (const argument of allArguments) {
      const key = argument.roundId ?? "unassigned";
      const list = map.get(key) ?? [];
      list.push(argument);
      map.set(key, list);
    }
    return map;
  }, [allArguments]);

  const nextRound = activeRound ? (rounds.find((r) => r.sequenceNumber === activeRound.sequenceNumber + 1) ?? null) : null;
  const isDebater = currentUser.membership.debaterStance !== null;

  const canSubmitArguments =
    debate.status === "active" && isDebater && activeRound !== null && isSubmissionPhase(activeRound.phase);

  const existingCountForEntryType = useMemo(() => {
    if (!currentUser.id || !activeRound || !isSubmissionPhase(activeRound.phase)) return 0;
    const entryType = activeRound.phase;
    return allArguments.filter((a) => a.authorId === currentUser.id && a.entryType === entryType).length;
  }, [allArguments, currentUser.id, activeRound]);

  const eligibleParents = useMemo(() => {
    if (!activeRound) return [];
    return allArguments.filter(
      (a) => a.roundSequence !== null && a.roundSequence < activeRound.sequenceNumber && a.authorId !== currentUser.id
    );
  }, [allArguments, activeRound, currentUser.id]);

  const isRoundExpiredWaiting =
    activeRound !== null &&
    isActiveRoundDue({
      debateFormatVersion: 2,
      debateStatus: debate.status,
      roundStatus: activeRound.status,
      endsAt: activeRound.endsAt,
      now: new Date(),
    });

  const roundsToRender = rounds.filter((round) => (argumentsByRound.get(round.id) ?? []).length > 0 || round.status !== "scheduled");

  return (
    <div>
      <div className="sticky top-16 z-30 -mx-4 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href="/debates" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-brand hover:underline">
              Debates
            </Link>
            <h1 className="line-clamp-1 font-display text-base font-bold text-ink sm:text-lg">{debate.title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge status={debate.status} closureKind={debate.closureKind} />
            <ShareButton />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-0">
        {refreshError ? (
          <p role="status" className="mb-4 rounded-lg border border-gray-200 bg-canvas px-3 py-2 text-xs text-gray-500">
            Could not refresh just now -- showing the last known state. This will retry automatically.
          </p>
        ) : null}

        <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={debate.status} closureKind={debate.closureKind} />
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">Structured debate</span>
          </div>
          <h2 className="font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">{debate.title}</h2>
          {debate.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">{debate.description}</p> : null}
          {debate.tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {debate.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-gray-500">
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 pt-4 text-xs text-gray-500">
            <span>Opened {formatRelativeTime(debate.createdAt)}</span>
            {debate.moderator ? (
              <span>
                Moderated by <span className="font-medium text-gray-700">{debate.moderator.full_name ?? debate.moderator.username}</span>
              </span>
            ) : null}
            <span>
              {membershipCounts.debatersFor} for &middot; {membershipCounts.debatersAgainst} against &middot; {membershipCounts.jurors}{" "}
              {membershipCounts.jurors === 1 ? "juror" : "jurors"}
            </span>
          </div>
        </section>

        <section className="mb-6">
          <V2RoundProgress rounds={rounds} />
        </section>

        {debate.status === "active" && activeRound ? (
          <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">{ROUND_PHASE_LABELS[activeRound.phase]}</p>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">{ROUND_PHASE_PURPOSE[activeRound.phase]}</p>
              </div>
              {activeRound.endsAt && !isRoundExpiredWaiting ? <DebateCountdown endsAt={activeRound.endsAt} /> : null}
            </div>
            {isRoundExpiredWaiting ? (
              <p role="status" className="mt-3 rounded-lg border border-dashed border-gray-200 bg-canvas px-3 py-2 text-xs text-gray-500">
                This round&apos;s time is up. Waiting for a moderator (or the scheduler, if configured) to advance the
                debate -- automatic advancement is not guaranteed to be running yet.
              </p>
            ) : null}
            {nextRound ? <p className="mt-3 text-xs text-gray-400">Next: {ROUND_PHASE_LABELS[nextRound.phase]}</p> : null}
          </section>
        ) : null}

        {debate.status === "open" && rounds[0]?.startsAt ? (
          <section className="mb-6 rounded-xl border border-dashed border-gray-200 bg-white p-4 text-xs text-gray-500">
            Scheduled to open {formatRelativeTime(rounds[0].startsAt)}.
          </section>
        ) : null}

        {currentUser.canManage ? (
          <section className="mb-6">
            <V2ModeratorControls debateId={debateId} debate={debate} activeRound={activeRound} nextRound={nextRound} onSuccess={refresh} />
          </section>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Argument timeline</p>

            {allArguments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
                No arguments submitted yet.
              </div>
            ) : (
              roundsToRender.map((round) => {
                const roundArguments = argumentsByRound.get(round.id) ?? [];
                return (
                  <div key={round.id} className="mb-6">
                    <p className="mb-2 text-sm font-semibold text-gray-700">{ROUND_PHASE_LABELS[round.phase]}</p>
                    {roundArguments.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 bg-white p-5 text-sm text-gray-400">
                        No submissions in this round yet.
                      </div>
                    ) : (
                      roundArguments.map((argument) => (
                        <V2ArgumentCard
                          key={argument.id}
                          argument={argument}
                          debateId={debateId}
                          currentUserId={currentUser.id}
                          isDebateActive={debate.status === "active"}
                          canRebut={Boolean(
                            canSubmitArguments &&
                              activeRound?.phase === "rebuttal" &&
                              argument.authorId !== currentUser.id &&
                              argument.roundSequence !== null &&
                              argument.roundSequence < activeRound.sequenceNumber
                          )}
                          onRebut={setSelectedParent}
                          onReactionSuccess={refresh}
                        />
                      ))
                    )}
                  </div>
                );
              })
            )}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-[88px] lg:self-start">
            <V2SubscriptionControl
              debateId={debateId}
              isAuthenticated={currentUser.isAuthenticated}
              initialSubscription={currentUser.subscription}
            />

            {debate.status === "open" ? (
              <>
                <V2Lobby
                  debateId={debateId}
                  isAuthenticated={currentUser.isAuthenticated}
                  membership={currentUser.membership}
                  membershipCounts={membershipCounts}
                  onSuccess={refresh}
                />
                <V2BallotPanel
                  debateId={debateId}
                  stage="initial"
                  isOpenForSubmission={isInitialBallotWindowOpen(debate.status)}
                  ownBallot={currentUser.ballots.initial}
                  results={ballotResults.initial}
                  isAuthenticated={currentUser.isAuthenticated}
                  onSuccess={refresh}
                />
              </>
            ) : null}

            {activeRound?.phase === "cross_examination" || room.crossExchanges.length > 0 ? (
              <V2CrossExamination
                debateId={debateId}
                exchanges={room.crossExchanges}
                debaters={room.debaters}
                arguments={allArguments}
                activeRound={activeRound}
                debateStatus={debate.status}
                currentUserId={currentUser.id}
                isAuthenticated={currentUser.isAuthenticated}
                ownStance={currentUser.membership.debaterStance}
                onSuccess={refresh}
              />
            ) : null}

            {debate.status === "active" && activeRound && isSubmissionPhase(activeRound.phase) ? (
              canSubmitArguments ? (
                <V2ArgumentComposer
                  debateId={debateId}
                  entryType={activeRound.phase}
                  ownStance={currentUser.membership.debaterStance!}
                  activeRoundSequence={activeRound.sequenceNumber}
                  existingCountForEntryType={existingCountForEntryType}
                  eligibleParents={eligibleParents}
                  selectedParent={selectedParent}
                  onClearSelectedParent={() => setSelectedParent(null)}
                  onSuccess={refresh}
                />
              ) : (
                <section className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
                  {currentUser.isAuthenticated
                    ? "Only joined debaters can submit arguments. Join as a debater from the lobby to take part."
                    : "Sign in and join as a debater to submit arguments."}
                </section>
              )
            ) : null}

            {debate.status === "active" && activeRound?.phase === "final_vote" ? (
              <V2BallotPanel
                debateId={debateId}
                stage="final"
                isOpenForSubmission={isFinalBallotWindowOpen(activeRound.status)}
                ownBallot={currentUser.ballots.final}
                results={ballotResults.final}
                eligibleArguments={allArguments}
                isAuthenticated={currentUser.isAuthenticated}
                onSuccess={refresh}
              />
            ) : null}

            {debate.status === "closed" ? (
              <ClosedSummary debate={debate} initialResults={ballotResults.initial} finalResults={ballotResults.final} />
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
