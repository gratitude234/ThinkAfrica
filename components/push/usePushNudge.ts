"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trackActivationEvent } from "@/lib/activationEvents";
import { getCurrentPushDeviceState } from "@/lib/pushClient";
import {
  getPushNudgeDecision,
  recordDeniedRecoveryImpression,
  recordPushOfferImpression,
  recordPushPermissionDenied,
  recordPushPermissionRestored,
  type LegacyPushPromptSeed,
  type PushNudgeDecision,
  type PushNudgeStateV2,
  type PushPermissionState,
} from "@/lib/pushPromptPolicy";
import {
  loadPushNudgeState,
  savePushNudgeState,
  updatePushNudgeState,
} from "@/lib/pushNudgeStorage";

export type PushNudgeSurface = "onboarding" | "home";
export type PushNudgeStatus = "checking" | "hidden" | "offer" | "denied-recovery";

interface ImpressionClaim {
  token: string;
  decision: Exclude<PushNudgeDecision, "none">;
  offerNumber: number;
}

const impressionClaims = new Map<string, ImpressionClaim>();

interface UsePushNudgeInput {
  userId: string;
  surface: PushNudgeSurface;
  legacySeed?: LegacyPushPromptSeed | null;
}

export function usePushNudge({ userId, surface, legacySeed }: UsePushNudgeInput) {
  const [status, setStatus] = useState<PushNudgeStatus>("checking");
  const [offerNumber, setOfferNumber] = useState(0);
  const [permission, setPermission] = useState<PushPermissionState>("default");
  const stateRef = useRef<PushNudgeStateV2 | null>(null);
  const tokenRef = useRef(`${Date.now()}:${Math.random()}`);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const device = await getCurrentPushDeviceState();
      if (cancelled) return;
      if (!device.supported) {
        setStatus("hidden");
        return;
      }

      setPermission(device.permission);
      const claimKey = `${userId}:${surface}`;
      const existingClaim = impressionClaims.get(claimKey);
      if (existingClaim?.token === tokenRef.current) {
        setOfferNumber(existingClaim.offerNumber);
        setStatus(existingClaim.decision);
        return;
      }

      let state = loadPushNudgeState(userId, legacySeed, device.permission);
      if (device.permission === "denied" && !state.deniedAt) {
        state = savePushNudgeState(userId, recordPushPermissionDenied(state));
      } else if (device.permission !== "denied" && state.deniedAt) {
        state = savePushNudgeState(userId, recordPushPermissionRestored(state));
      }
      stateRef.current = state;

      let decision = getPushNudgeDecision({
        state,
        supported: true,
        permission: device.permission,
        subscribed: Boolean(device.subscription),
      });
      if (surface === "onboarding" && decision === "denied-recovery") decision = "none";

      if (decision === "none") {
        setStatus("hidden");
        return;
      }

      const nextState =
        decision === "offer"
          ? recordPushOfferImpression(state)
          : recordDeniedRecoveryImpression(state);
      savePushNudgeState(userId, nextState);
      stateRef.current = nextState;
      const nextOfferNumber = decision === "offer" ? nextState.offersShown : state.offersShown;
      impressionClaims.set(claimKey, {
        token: tokenRef.current,
        decision,
        offerNumber: nextOfferNumber,
      });

      trackActivationEvent({
        event: "push_nudge_shown",
        source: surface,
        metadata: {
          surface,
          mode: decision,
          offerNumber: nextOfferNumber,
          permission: device.permission,
        },
      });
      setOfferNumber(nextOfferNumber);
      setStatus(decision);
    })();

    return () => {
      cancelled = true;
    };
  }, [legacySeed, surface, userId]);

  const hide = useCallback(() => setStatus("hidden"), []);

  const notePermission = useCallback(
    (nextPermission: PushPermissionState) => {
      setPermission(nextPermission);
      const fallback = stateRef.current;
      if (!fallback) return;
      const next = updatePushNudgeState(
        userId,
        (current) =>
          nextPermission === "denied"
            ? recordPushPermissionDenied(current)
            : recordPushPermissionRestored(current),
        fallback
      );
      stateRef.current = next;
    },
    [userId]
  );

  return { status, offerNumber, permission, hide, notePermission };
}
