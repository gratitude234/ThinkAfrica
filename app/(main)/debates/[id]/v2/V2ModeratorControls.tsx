"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { violatesForceCloseReasonRequirement } from "@/lib/debateV2Lifecycle";
import { interpretRoundTransitionResult, isStaleTransitionOutcome } from "@/lib/debateV2Ui";
import { ROUND_PHASE_LABELS } from "./labels";
import {
  advanceDebateRoundV2Action,
  closeDebateV2Action,
  extendDebateRoundV2Action,
  startDebateV2Action,
} from "./actions";
import type { DebateV2DebateSummary, DebateV2RoundView } from "./types";

const MAX_EXTENSION_MINUTES = 60;

export default function V2ModeratorControls({
  debateId,
  debate,
  activeRound,
  nextRound,
  onSuccess,
}: {
  debateId: string;
  debate: DebateV2DebateSummary;
  activeRound: DebateV2RoundView | null;
  nextRound: DebateV2RoundView | null;
  onSuccess: () => void;
}) {
  const [pending, setPending] = useState<"start" | "advance" | "extend" | "close" | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [extendMinutes, setExtendMinutes] = useState(10);
  const [forcingClose, setForcingClose] = useState(false);
  const [forceReason, setForceReason] = useState("");

  async function handleStart() {
    if (pending) return;
    setPending("start");
    setNotice(null);
    const result = await startDebateV2Action(debateId);
    setPending(null);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    onSuccess();
  }

  async function handleAdvanceOrClose() {
    if (!activeRound || pending) return;
    setPending(activeRound.phase === "final_vote" ? "close" : "advance");
    setNotice(null);

    const result =
      activeRound.phase === "final_vote"
        ? await closeDebateV2Action(debateId, false, null)
        : await advanceDebateRoundV2Action(debateId, activeRound.id);

    setPending(null);

    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }

    const outcome = interpretRoundTransitionResult(result.data);
    if (isStaleTransitionOutcome(outcome)) {
      setNotice({ tone: "info", text: "The debate changed before this action completed. Refreshing…" });
    }
    onSuccess();
  }

  async function handleExtend() {
    if (!activeRound || pending) return;
    setPending("extend");
    setNotice(null);

    // activeRound.endsAt is passed through exactly as fetched from Supabase
    // -- never reparsed/reserialized, so no timestamp precision is lost.
    const result = await extendDebateRoundV2Action(debateId, activeRound.id, activeRound.endsAt, extendMinutes);

    setPending(null);

    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }

    const outcome = interpretRoundTransitionResult(result.data);
    if (isStaleTransitionOutcome(outcome)) {
      setNotice({ tone: "info", text: "The round changed before this extension applied. Refreshing…" });
    }
    onSuccess();
  }

  async function handleForceClose() {
    if (pending) return;
    if (violatesForceCloseReasonRequirement(true, forceReason)) {
      setNotice({ tone: "error", text: "A reason is required to force-close a debate." });
      return;
    }

    setPending("close");
    setNotice(null);
    const result = await closeDebateV2Action(debateId, true, forceReason);
    setPending(null);

    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }

    setForcingClose(false);
    setForceReason("");
    onSuccess();
  }

  if (debate.status === "closed") return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Moderator controls</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {debate.status === "open" ? (
          <Button size="sm" onClick={() => void handleStart()} loading={pending === "start"} disabled={pending !== null}>
            Start debate
          </Button>
        ) : activeRound ? (
          <>
            <Button
              size="sm"
              onClick={() => void handleAdvanceOrClose()}
              loading={pending === "advance" || pending === "close"}
              disabled={pending !== null}
            >
              {activeRound.phase === "final_vote"
                ? "Close debate"
                : `Advance to ${nextRound ? ROUND_PHASE_LABELS[nextRound.phase] : "next round"}`}
            </Button>

            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={MAX_EXTENSION_MINUTES}
                value={extendMinutes}
                onChange={(e) => setExtendMinutes(Math.min(MAX_EXTENSION_MINUTES, Math.max(1, Number(e.target.value) || 1)))}
                aria-label="Extension minutes"
                disabled={pending !== null}
                className="w-16 rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              />
              <Button size="sm" variant="secondary" onClick={() => void handleExtend()} loading={pending === "extend"} disabled={pending !== null}>
                Extend {extendMinutes}m
              </Button>
            </div>
          </>
        ) : null}
      </div>

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mt-3 text-xs ${notice.tone === "error" ? "text-red-600" : "text-amber-700"}`}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="mt-4 border-t border-amber-200 pt-3">
        {!forcingClose ? (
          <button
            type="button"
            onClick={() => setForcingClose(true)}
            disabled={pending !== null}
            className="text-xs font-semibold text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            Force-close this debate early
          </button>
        ) : (
          <div className="rounded-lg border border-red-200 bg-white p-3">
            <p className="text-sm font-semibold text-red-700">Force-close this debate?</p>
            <p className="mt-1 text-xs leading-5 text-gray-600">
              This ends the debate immediately, before final voting completes normally. A reason is
              required and will be recorded in the moderation log.
            </p>
            <label htmlFor="force-close-reason" className="sr-only">
              Reason for forced closure
            </label>
            <textarea
              id="force-close-reason"
              value={forceReason}
              onChange={(e) => setForceReason(e.target.value)}
              rows={2}
              placeholder="Reason (required)"
              className="mt-2 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => { setForcingClose(false); setForceReason(""); }} disabled={pending !== null}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => void handleForceClose()}
                loading={pending === "close"}
                disabled={pending !== null || !forceReason.trim()}
              >
                Force close
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
