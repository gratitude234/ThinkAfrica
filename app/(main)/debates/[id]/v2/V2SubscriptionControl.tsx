"use client";

/**
 * Debate V2 Phase 4B: compact follow/unfollow + preference control for the
 * room. Every mutation is optimistic -- the checkbox/button the user just
 * interacted with is updated immediately and stays exactly where they left
 * it even if the save fails, so a recoverable error never costs them their
 * selection (see save()'s own comment). Deliberately does not call the
 * room's onSuccess/refresh -- see actions.ts's setDebateSubscriptionV2Action
 * for why a full room reload is never warranted for a subscription-only
 * change.
 */

import { useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { setDebateSubscriptionV2Action } from "./actions";
import type { DebateV2SubscriptionView } from "./types";

const DEFAULT_SUBSCRIBED: DebateV2SubscriptionView = {
  isSubscribed: true,
  notifyPhaseChanges: true,
  notifyDirectResponses: true,
  notifyEvidenceRequests: true,
  notifyFinalVote: true,
  notifyRecap: true,
};

type PreferenceKey = Exclude<keyof DebateV2SubscriptionView, "isSubscribed">;

const PREFERENCES: { key: PreferenceKey; label: string }[] = [
  { key: "notifyPhaseChanges", label: "Round and phase changes" },
  { key: "notifyDirectResponses", label: "Direct responses to you" },
  { key: "notifyEvidenceRequests", label: "Evidence requests on your arguments" },
  { key: "notifyFinalVote", label: "Final vote opens" },
  { key: "notifyRecap", label: "Recap ready" },
];

export default function V2SubscriptionControl({
  debateId,
  isAuthenticated,
  initialSubscription,
}: {
  debateId: string;
  isAuthenticated: boolean;
  initialSubscription: DebateV2SubscriptionView | null;
}) {
  const [subscription, setSubscription] = useState<DebateV2SubscriptionView | null>(initialSubscription);
  const [showPreferences, setShowPreferences] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAttempted, setLastAttempted] = useState<DebateV2SubscriptionView | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const isFollowing = subscription?.isSubscribed ?? false;

  async function save(next: DebateV2SubscriptionView) {
    setIsPending(true);
    setError(null);
    setJustSaved(false);
    setLastAttempted(next);

    const result = await setDebateSubscriptionV2Action({
      debateId,
      isSubscribed: next.isSubscribed,
      notifyPhaseChanges: next.notifyPhaseChanges,
      notifyDirectResponses: next.notifyDirectResponses,
      notifyEvidenceRequests: next.notifyEvidenceRequests,
      notifyFinalVote: next.notifyFinalVote,
      notifyRecap: next.notifyRecap,
    });

    setIsPending(false);

    if (!result.ok) {
      // The optimistic value set by the caller (follow/unfollow/
      // togglePreference, below) is left exactly as the user left it -- not
      // reverted to the last known-good server state -- so their selection
      // survives the error. "Try again" (rendered below) resubmits this
      // same lastAttempted value rather than asking them to redo the click.
      setError(result.error);
      return;
    }

    setSubscription({
      isSubscribed: result.data.is_subscribed,
      notifyPhaseChanges: result.data.notify_phase_changes,
      notifyDirectResponses: result.data.notify_direct_responses,
      notifyEvidenceRequests: result.data.notify_evidence_requests,
      notifyFinalVote: result.data.notify_final_vote,
      notifyRecap: result.data.notify_recap,
    });
    setJustSaved(true);
  }

  function follow() {
    const next = subscription ? { ...subscription, isSubscribed: true } : DEFAULT_SUBSCRIBED;
    setSubscription(next);
    void save(next);
  }

  function unfollow() {
    const next: DebateV2SubscriptionView = subscription
      ? { ...subscription, isSubscribed: false }
      : { ...DEFAULT_SUBSCRIBED, isSubscribed: false };
    setSubscription(next);
    setShowPreferences(false);
    void save(next);
  }

  function togglePreference(key: PreferenceKey) {
    if (!subscription) return;
    const next: DebateV2SubscriptionView = { ...subscription, [key]: !subscription[key] };
    setSubscription(next);
    void save(next);
  }

  function retry() {
    if (lastAttempted) void save(lastAttempted);
  }

  if (!isAuthenticated) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-500">
        <Link
          href={`/login?redirectTo=/debates/${debateId}`}
          className="font-medium text-emerald-600 hover:underline focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded"
        >
          Sign in
        </Link>{" "}
        to follow this debate and get notified about updates.
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">Notifications</p>
          <p className="mt-1 text-xs text-gray-500">
            {isFollowing ? "You're following this debate." : "Follow to get notified about updates."}
          </p>
        </div>
        {isFollowing ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={unfollow}
            loading={isPending}
            aria-label="Unfollow this debate"
          >
            Following
          </Button>
        ) : (
          <Button size="sm" onClick={follow} loading={isPending} aria-label="Follow this debate">
            Follow
          </Button>
        )}
      </div>

      {isFollowing ? (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={() => setShowPreferences((value) => !value)}
            aria-expanded={showPreferences}
            className="rounded text-xs font-medium text-emerald-600 hover:underline focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {showPreferences ? "Hide notification preferences" : "Manage notification preferences"}
          </button>

          {showPreferences ? (
            <fieldset disabled={isPending} className="mt-3 space-y-1">
              <legend className="sr-only">Notification preferences for this debate</legend>
              {PREFERENCES.map((pref) => (
                <label
                  key={pref.key}
                  className="flex items-center gap-2 rounded py-1 text-xs text-gray-700 disabled:opacity-50"
                >
                  <input
                    type="checkbox"
                    checked={subscription?.[pref.key] ?? true}
                    onChange={() => togglePreference(pref.key)}
                    className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500"
                  />
                  {pref.label}
                </label>
              ))}
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="mt-3 flex items-center justify-between gap-2 text-xs text-red-600">
          <span>{error}</span>
          <button
            type="button"
            onClick={retry}
            className="shrink-0 rounded font-medium underline focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Try again
          </button>
        </div>
      ) : null}
      {!error && justSaved ? (
        <p role="status" className="mt-3 text-xs text-emerald-600">
          Saved.
        </p>
      ) : null}
    </section>
  );
}
