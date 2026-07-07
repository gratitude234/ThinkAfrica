"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type DebatePhase, PHASE_LABELS } from "@/lib/debatePhases";
import { closeDebateAction, startDebateAction } from "./actions";

interface PhaseControlsProps {
  debateId: string;
  currentPhase: DebatePhase;
  debateStatus: string;
}

const PHASE_ORDER: DebatePhase[] = ["opening", "rebuttal", "closing"];

export default function PhaseControls({
  debateId,
  currentPhase,
  debateStatus,
}: PhaseControlsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<"advance" | "close" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const isLastPhase = currentPhase === "closing";
  const isClosed = debateStatus === "closed";
  const isOpen = debateStatus === "open";
  const nextPhase = PHASE_ORDER[PHASE_ORDER.indexOf(currentPhase) + 1];

  async function handleClose() {
    setLoading("close");
    setError(null);

    try {
      await closeDebateAction(debateId);
      setConfirmingClose(false);
      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Failed to close debate."
      );
    }

    setLoading(null);
  }

  if (isClosed) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">
            Moderator controls
          </span>
          <p className="mt-1 text-sm font-semibold text-amber-950">
            {isOpen
              ? "Open motion: start the debate when both sides are ready."
              : `Current phase: ${PHASE_LABELS[currentPhase]}`}
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-700">
            {isOpen
              ? "Starting locks the room into structured rounds and opens argument submission."
              : "Advance the room only when the current phase has enough substantive arguments."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isOpen ? (
            <button
              type="button"
              disabled={loading !== null}
              onClick={async () => {
                setLoading("advance");
                setError(null);

                try {
                  await startDebateAction(debateId);
                  router.refresh();
                } catch (actionError) {
                  setError(
                    actionError instanceof Error
                      ? actionError.message
                      : "Failed to start debate."
                  );
                }

                setLoading(null);
              }}
              className="rounded-lg bg-emerald-brand px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0E4B37] disabled:opacity-50"
            >
              {loading === "advance" ? "Starting..." : "Start Debate"}
            </button>
          ) : !isLastPhase ? (
            <button
              type="button"
              disabled={loading !== null}
              onClick={async () => {
                setLoading("advance");
                setError(null);

                const supabase = createClient();
                const { error: rpcError } = await supabase.rpc("advance_debate_phase", {
                  p_debate_id: debateId,
                });

                if (rpcError) {
                  setError(rpcError.message);
                } else {
                  router.refresh();
                }

                setLoading(null);
              }}
              className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              {loading === "advance"
                ? "Advancing..."
                : `Advance to ${PHASE_LABELS[nextPhase]}`}
            </button>
          ) : (
            <span className="rounded-lg bg-white/70 px-3 py-1.5 text-xs font-semibold text-amber-700">
              Final phase
            </span>
          )}

          {!isOpen && isLastPhase ? (
            <button
              type="button"
              disabled={loading !== null}
              onClick={() => setConfirmingClose(true)}
              className="rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              Close Debate
            </button>
          ) : null}
        </div>
      </div>

      {confirmingClose ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-white p-4">
          <p className="text-sm font-semibold text-gray-900">
            Close this debate?
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            Voting and argument submission will stop, the room will be archived,
            and recap generation will begin.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading !== null}
              onClick={() => setConfirmingClose(false)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-canvas disabled:opacity-50"
            >
              Keep open
            </button>
            <button
              type="button"
              disabled={loading !== null}
              onClick={() => void handleClose()}
              className="rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
            >
              {loading === "close" ? "Closing..." : "Close now"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
