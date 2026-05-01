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

  const isLastPhase = currentPhase === "closing";
  const isClosed = debateStatus === "closed";
  const isOpen = debateStatus === "open";
  const nextPhase = PHASE_ORDER[PHASE_ORDER.indexOf(currentPhase) + 1];

  if (isClosed) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <span className="text-xs font-bold uppercase tracking-wide text-amber-700">
          Moderator
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
              className="rounded-lg bg-emerald-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
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
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              {loading === "advance"
                ? "Advancing..."
                : `Advance to ${PHASE_LABELS[nextPhase]}`}
            </button>
          ) : (
            <span className="text-xs text-amber-500">
              Final phase - close the debate when done.
            </span>
          )}

          {!isOpen && isLastPhase ? (
            <button
              type="button"
              disabled={loading !== null}
              onClick={async () => {
                if (!window.confirm("Close this debate? This cannot be undone.")) {
                  return;
                }

                setLoading("close");
                setError(null);

                try {
                  await closeDebateAction(debateId);
                  router.refresh();
                } catch (actionError) {
                  setError(
                    actionError instanceof Error
                      ? actionError.message
                      : "Failed to close debate."
                  );
                }

                setLoading(null);
              }}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              {loading === "close" ? "Closing..." : "Close Debate"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
