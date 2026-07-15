export const PUSH_PROMPT_MAX_ATTEMPTS = 3;
export const PUSH_PROMPT_COOLDOWN_MS = 20 * 24 * 60 * 60 * 1000;
export const PUSH_NUDGE_STATE_VERSION = 2 as const;

export type PushPermissionState = "default" | "denied" | "granted";

export interface LegacyPushPromptSeed {
  attemptCount: number | null;
  lastShownAt: string | null;
  shownAt: string | null;
}

export interface PushNudgeStateV2 {
  version: typeof PUSH_NUDGE_STATE_VERSION;
  offersShown: number;
  lastOfferedAt: string | null;
  deniedAt: string | null;
  deniedRecoveryShown: boolean;
  disabledByUser: boolean;
}

export type PushNudgeDecision = "none" | "offer" | "denied-recovery";

function validTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

export function createEmptyPushNudgeState(): PushNudgeStateV2 {
  return {
    version: PUSH_NUDGE_STATE_VERSION,
    offersShown: 0,
    lastOfferedAt: null,
    deniedAt: null,
    deniedRecoveryShown: false,
    disabledByUser: false,
  };
}

export function seedPushNudgeState(
  legacy: LegacyPushPromptSeed | null | undefined,
  permission: PushPermissionState,
  now = new Date()
): PushNudgeStateV2 {
  const empty = createEmptyPushNudgeState();
  if (!legacy) {
    return permission === "denied" ? { ...empty, deniedAt: now.toISOString() } : empty;
  }

  const rawAttempts = Number.isFinite(legacy.attemptCount) ? legacy.attemptCount ?? 0 : 0;
  const legacyTimestamp = validTimestamp(legacy.lastShownAt) ?? validTimestamp(legacy.shownAt);
  const onboardingOnlyOffer = rawAttempts === 0 && Boolean(validTimestamp(legacy.shownAt));
  const offersShown = Math.min(
    PUSH_PROMPT_MAX_ATTEMPTS,
    Math.max(0, onboardingOnlyOffer ? 1 : rawAttempts)
  );
  const wasTerminal = rawAttempts > PUSH_PROMPT_MAX_ATTEMPTS;

  return {
    ...empty,
    offersShown,
    lastOfferedAt: offersShown > 0 ? legacyTimestamp : null,
    deniedAt:
      permission === "denied" ? legacyTimestamp ?? now.toISOString() : null,
    deniedRecoveryShown: permission === "denied" && wasTerminal,
  };
}

export function normalizePushNudgeState(value: unknown): PushNudgeStateV2 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<PushNudgeStateV2>;
  if (candidate.version !== PUSH_NUDGE_STATE_VERSION) return null;
  if (!Number.isInteger(candidate.offersShown)) return null;

  return {
    version: PUSH_NUDGE_STATE_VERSION,
    offersShown: Math.min(
      PUSH_PROMPT_MAX_ATTEMPTS,
      Math.max(0, candidate.offersShown ?? 0)
    ),
    lastOfferedAt: validTimestamp(candidate.lastOfferedAt),
    deniedAt: validTimestamp(candidate.deniedAt),
    deniedRecoveryShown: candidate.deniedRecoveryShown === true,
    disabledByUser: candidate.disabledByUser === true,
  };
}

function cooldownElapsed(timestamp: string | null, nowMs: number) {
  if (!timestamp) return true;
  const timestampMs = new Date(timestamp).getTime();
  return Number.isNaN(timestampMs) || nowMs - timestampMs >= PUSH_PROMPT_COOLDOWN_MS;
}

export function getPushNudgeDecision(input: {
  state: PushNudgeStateV2;
  supported: boolean;
  permission: PushPermissionState;
  subscribed: boolean;
  now?: Date;
}): PushNudgeDecision {
  const { state, supported, permission, subscribed } = input;
  const nowMs = (input.now ?? new Date()).getTime();

  if (!supported || subscribed || state.disabledByUser) return "none";

  if (permission === "denied") {
    if (!state.deniedAt || state.deniedRecoveryShown) return "none";
    return cooldownElapsed(state.deniedAt, nowMs) ? "denied-recovery" : "none";
  }

  if (state.offersShown >= PUSH_PROMPT_MAX_ATTEMPTS) return "none";
  return cooldownElapsed(state.lastOfferedAt, nowMs) ? "offer" : "none";
}

export function recordPushOfferImpression(
  state: PushNudgeStateV2,
  now = new Date()
): PushNudgeStateV2 {
  return {
    ...state,
    offersShown: Math.min(PUSH_PROMPT_MAX_ATTEMPTS, state.offersShown + 1),
    lastOfferedAt: now.toISOString(),
  };
}

export function recordPushPermissionDenied(
  state: PushNudgeStateV2,
  now = new Date()
): PushNudgeStateV2 {
  return {
    ...state,
    deniedAt: state.deniedAt ?? now.toISOString(),
    deniedRecoveryShown: false,
  };
}

export function recordDeniedRecoveryImpression(state: PushNudgeStateV2): PushNudgeStateV2 {
  return { ...state, deniedRecoveryShown: true };
}

export function recordPushPermissionRestored(state: PushNudgeStateV2): PushNudgeStateV2 {
  return { ...state, deniedAt: null, deniedRecoveryShown: false };
}
