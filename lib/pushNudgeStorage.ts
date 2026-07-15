import {
  normalizePushNudgeState,
  seedPushNudgeState,
  type LegacyPushPromptSeed,
  type PushNudgeStateV2,
  type PushPermissionState,
} from "@/lib/pushPromptPolicy";

const memoryState = new Map<string, PushNudgeStateV2>();

export function pushNudgeStorageKey(userId: string) {
  return `indegenius:push-nudge:v2:${userId}`;
}

function readLocalState(key: string): PushNudgeStateV2 | null {
  try {
    return normalizePushNudgeState(JSON.parse(window.localStorage.getItem(key) ?? "null"));
  } catch {
    return null;
  }
}

export function savePushNudgeState(userId: string, state: PushNudgeStateV2) {
  const key = pushNudgeStorageKey(userId);
  memoryState.set(key, state);
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // The in-memory copy prevents repeated prompts for this browser session.
  }
  return state;
}

export function loadPushNudgeState(
  userId: string,
  legacy: LegacyPushPromptSeed | null | undefined,
  permission: PushPermissionState,
  now = new Date()
) {
  const key = pushNudgeStorageKey(userId);
  const local = readLocalState(key);
  if (local) {
    memoryState.set(key, local);
    return local;
  }

  const memory = memoryState.get(key);
  if (memory) return memory;

  return savePushNudgeState(userId, seedPushNudgeState(legacy, permission, now));
}

export function updatePushNudgeState(
  userId: string,
  updater: (state: PushNudgeStateV2) => PushNudgeStateV2,
  fallback: PushNudgeStateV2
) {
  const key = pushNudgeStorageKey(userId);
  const current = readLocalState(key) ?? memoryState.get(key) ?? fallback;
  return savePushNudgeState(userId, updater(current));
}

export function setPushNudgeDisabled(userId: string, disabled: boolean) {
  const key = pushNudgeStorageKey(userId);
  const current = readLocalState(key) ?? memoryState.get(key);
  if (!current) return;
  savePushNudgeState(userId, { ...current, disabledByUser: disabled });
}

export function clearPushNudgeMemoryForTests() {
  memoryState.clear();
}
