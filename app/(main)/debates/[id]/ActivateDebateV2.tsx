"use client";

/**
 * Debate V2 Phase 3: the V1-side entry point for converting an eligible open
 * V1 debate into the structured Debate V2 format. Only ever rendered by
 * page.tsx for a moderator viewing an open debate -- see that file's
 * decideActivation call for the eligibility computation this displays.
 *
 * activate_debate_v2 is service_role-only and is called exclusively via
 * activateDebateV2Action (app/(main)/debates/[id]/v2/actions.ts), which
 * derives the actor from the signed-in session server-side. This component
 * never assumes success: it only triggers a router refresh afterward, and
 * the next Server Component render is what actually decides -- via the
 * freshly-fetched format_version -- whether the V2 room now renders.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { activateDebateV2Action } from "./v2/actions";

export default function ActivateDebateV2({
  debateId,
  eligible,
  ineligibleReason,
}: {
  debateId: string;
  eligible: boolean;
  ineligibleReason: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleActivate() {
    setActivating(true);
    setError(null);

    const result = await activateDebateV2Action(debateId);

    setActivating(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setConfirming(false);
    router.refresh();
  }

  return (
    <section className="mb-6 rounded-xl border border-dashed border-violet-300 bg-violet-50 p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700">Debate V2 (beta)</p>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-violet-900">
        Convert this lobby into the new structured Debate V2 format: five timed rounds, per-round
        argument limits, initial and final ballots, and reactions. Conversion only affects this debate.
      </p>

      {!eligible ? (
        <p className="mt-3 text-xs text-violet-700/80">{ineligibleReason}</p>
      ) : !confirming ? (
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => setConfirming(true)}>
          Enable structured Debate V2
        </Button>
      ) : (
        <div className="mt-3 rounded-lg border border-violet-300 bg-white p-3">
          <p className="text-sm font-semibold text-violet-900">Convert to Debate V2?</p>
          <p className="mt-1 text-xs leading-5 text-gray-600">
            This cannot be undone. The current open-lobby experience is replaced immediately by the
            round-based V2 room for everyone viewing this debate.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={activating}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleActivate()} loading={activating}>
              Convert to V2
            </Button>
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
