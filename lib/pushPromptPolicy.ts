// Shared constants for the home-page push re-prompt policy. Kept in a
// dependency-free module so both the server component (home page) and the
// client component (PushPromptBanner) can import them without pulling in
// browser-only code.

// push_prompt_attempt_count semantics:
//   0..MAX_ATTEMPTS-1 (0,1,2)  -> retries remaining, cooldown-gated
//   MAX_ATTEMPTS (3)           -> exhausted or denied; show the one-time
//                                 "manage in Settings" pointer
//   MAX_ATTEMPTS + 1 (4)       -> pointer already shown; never render again
export const PUSH_PROMPT_MAX_ATTEMPTS = 3;
export const PUSH_PROMPT_TERMINAL_COUNT = PUSH_PROMPT_MAX_ATTEMPTS + 1;
export const PUSH_PROMPT_COOLDOWN_MS = 20 * 24 * 60 * 60 * 1000;
