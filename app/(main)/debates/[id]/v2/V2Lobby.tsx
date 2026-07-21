"use client";

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import type { DebateStance } from "@/lib/debateV2";
import { STANCE_LABELS } from "./labels";
import { joinDebateV2Action } from "./actions";
import type { DebateV2CurrentUserMembership, DebateV2MembershipCounts } from "./types";

export default function V2Lobby({
  debateId,
  isAuthenticated,
  membership,
  membershipCounts,
  onSuccess,
}: {
  debateId: string;
  isAuthenticated: boolean;
  membership: DebateV2CurrentUserMembership;
  membershipCounts: DebateV2MembershipCounts;
  onSuccess: () => void;
}) {
  const [pendingStance, setPendingStance] = useState<DebateStance | null>(null);
  const [joiningDebater, setJoiningDebater] = useState(false);
  const [joiningJuror, setJoiningJuror] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmJoinAsDebater() {
    if (!pendingStance) return;
    setJoiningDebater(true);
    setError(null);

    // The server is authoritative on which stance actually got persisted --
    // see join_debate_v2's own "cannot change sides by calling the RPC
    // again" guarantee. This component never assumes p_stance "won"; it
    // just triggers a refresh, and the refreshed membership (ground truth)
    // is what actually renders next.
    const result = await joinDebateV2Action(debateId, "debater", pendingStance);

    setJoiningDebater(false);
    setPendingStance(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onSuccess();
  }

  async function joinAsJuror() {
    setJoiningJuror(true);
    setError(null);

    const result = await joinDebateV2Action(debateId, "juror");

    setJoiningJuror(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onSuccess();
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">Join the room</p>
      <p className="mt-1 text-xs leading-5 text-gray-500">
        You can hold more than one role here -- debating and judging are tracked separately.
      </p>

      {!isAuthenticated ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-canvas p-4 text-center text-sm text-gray-500">
          <Link href={`/login?redirectTo=/debates/${debateId}`} className="font-medium text-emerald-600 hover:underline">
            Sign in
          </Link>{" "}
          to debate, judge, or vote.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Debating */}
          <div className="rounded-lg border border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-800">Debating</p>
            {membership.debaterStance ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="rounded-full border-2 border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  Arguing {STANCE_LABELS[membership.debaterStance]} — locked
                </span>
              </div>
            ) : pendingStance ? (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">
                  Confirm: argue {STANCE_LABELS[pendingStance]}?
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  Your stance is <strong>permanent</strong> once confirmed. You will not be able to
                  switch sides in this debate afterwards.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setPendingStance(null)} disabled={joiningDebater}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => void confirmJoinAsDebater()} loading={joiningDebater}>
                    Confirm {STANCE_LABELS[pendingStance]}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPendingStance("for")}
                  className="flex items-center justify-center rounded-lg border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  Argue FOR
                </button>
                <button
                  type="button"
                  onClick={() => setPendingStance("against")}
                  className="flex items-center justify-center rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100"
                >
                  Argue AGAINST
                </button>
              </div>
            )}
            <p className="mt-2 text-xs text-gray-400">
              {membershipCounts.debatersFor} for · {membershipCounts.debatersAgainst} against
            </p>
          </div>

          {/* Judging */}
          <div className="rounded-lg border border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-800">Judging</p>
            {membership.isJuror ? (
              <span className="mt-2 inline-flex rounded-full border-2 border-gray-300 bg-gray-50 px-3 py-1 text-xs font-bold text-gray-700">
                You&apos;re a juror — no stance
              </span>
            ) : (
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => void joinAsJuror()} loading={joiningJuror}>
                Join as juror
              </Button>
            )}
            <p className="mt-2 text-xs text-gray-400">{membershipCounts.jurors} jurors so far</p>
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}
