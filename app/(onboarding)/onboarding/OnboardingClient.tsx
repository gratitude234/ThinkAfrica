"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import AvatarUploader from "@/app/(main)/settings/AvatarUploader";
import { saveProfileMedia } from "@/app/(main)/settings/profileActions";
import { trackActivationEvent } from "@/lib/activationEvents";
import { BRAND_NAME } from "@/lib/brand";
import { checkUsernameAvailable } from "@/lib/composerActions";
import { INTEREST_OPTIONS } from "@/lib/interests";
import {
  getOnboardingProfileError,
  ONBOARDING_STEPS,
  resolveOnboardingStep,
  type OnboardingStep,
} from "@/lib/onboarding";
import { loadOnboardingState } from "@/lib/onboardingActions";
import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH,
} from "@/lib/profileIdentity";
import {
  getProfileUsernameError,
  getUsableProfileUsername,
  normalizeProfileUsername,
} from "@/lib/profileUsername";
import {
  completeOnboarding,
  saveOnboardingProfile,
  saveOnboardingTopics,
} from "./actions";

interface OnboardingClientProps {
  requestedStep: string | null;
}

/** Whether the username typed is known to be free. "idle" means nothing is in doubt. */
type UsernameCheck = "idle" | "checking" | "taken" | "failed";

const INPUT_STYLES =
  "min-h-12 w-full rounded-xl border border-card-border bg-card px-4 py-3 text-sm text-ink shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-ink-muted focus:border-emerald-brand focus:ring-4 focus:ring-green-tint disabled:cursor-not-allowed disabled:bg-gray-50";

const TITLES: Record<OnboardingStep, string> = {
  profile: "Set up your profile",
  topics: "Choose what to read",
};

const SUBTITLES: Record<OnboardingStep, string> = {
  profile:
    "Your name and a username are all you need. A photo and a bio are optional.",
  topics:
    "Pick a few topics to shape your feed. You can skip this and change it later.",
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
      {children}
    </span>
  );
}

export default function OnboardingClient({ requestedStep }: OnboardingClientProps) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const trackedStartRef = useRef(false);
  // Read once. Every step change calls router.replace, which would otherwise
  // feed a new requestedStep into the loader and refetch the whole profile
  // mid-flow, wiping anything typed but not yet saved. replace adds no history
  // entry, so this prop only changes as a result of our own navigation.
  const requestedStepRef = useRef(requestedStep);
  const [isEnteringApp, startEnteringApp] = useTransition();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState<OnboardingStep>("profile");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [savedUsername, setSavedUsername] = useState("");
  const [usernameCheck, setUsernameCheck] = useState<UsernameCheck>("idle");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [savedInterests, setSavedInterests] = useState<string[]>([]);

  const currentIndex = ONBOARDING_STEPS.indexOf(step);

  const goToStep = useCallback(
    (nextStep: OnboardingStep) => {
      setError(null);
      setStep(nextStep);
      router.replace(`/onboarding?step=${nextStep}`);
    },
    [router]
  );

  useEffect(() => {
    if (!ready) return;
    const frame = window.requestAnimationFrame(() => headingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [ready, step]);

  useEffect(() => {
    let cancelled = false;

    async function loadOnboarding() {
      const state = await loadOnboardingState();
      if (cancelled) return;

      if (!state.ok) {
        if (state.reason === "unauthorized") {
          router.replace("/login");
          return;
        }
        // Deliberately not treated as "onboarding incomplete". An absent
        // completion flag is falsy, so an outage would drop a long-standing
        // member back into setup. Unknown is its own state.
        setError("We couldn't load your profile. Please refresh and try again.");
        setReady(true);
        return;
      }

      if (!trackedStartRef.current) {
        trackedStartRef.current = true;
        trackActivationEvent({ event: "onboarding_started" });
      }

      if (state.data.completed) {
        router.replace("/");
        return;
      }

      const profile = state.data.profile;
      const storedName = profile.full_name?.trim() ?? "";
      const storedUsername = getUsableProfileUsername(profile.username) ?? "";
      const storedInterests = (profile.interests ?? []).filter((interest) =>
        INTEREST_OPTIONS.some((option) => option.label === interest)
      );

      setUserId(state.data.userId);
      setFullName(storedName);
      setUsername(storedUsername);
      setSavedUsername(storedUsername);
      setBio(profile.bio ?? "");
      setAvatarUrl(profile.avatar_url);
      setInterests(storedInterests);
      setSavedInterests(storedInterests);

      // A member who stopped on a retired step resumes on the step that now
      // holds its purpose; see LEGACY_ONBOARDING_STEPS.
      const initialRequestedStep = requestedStepRef.current;
      const resolvedStep = resolveOnboardingStep(initialRequestedStep, {
        fullName: storedName,
        username: storedUsername,
      });
      setStep(resolvedStep);
      if (initialRequestedStep !== resolvedStep) {
        router.replace(`/onboarding?step=${resolvedStep}`);
      }
      setReady(true);
    }

    void loadOnboarding();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const normalizedUsername = normalizeProfileUsername(username);
  const usernameFormatError = username
    ? getProfileUsernameError(normalizedUsername)
    : null;

  useEffect(() => {
    if (!ready) return;
    if (normalizedUsername === savedUsername || usernameFormatError) {
      setUsernameCheck("idle");
      return;
    }

    setUsernameCheck("checking");
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await checkUsernameAvailable(normalizedUsername);
      if (cancelled) return;
      // Three outcomes, not two. A check that could not run must not read as
      // "available", or the member is sent into a save that rejects them.
      setUsernameCheck(!result.ok ? "failed" : result.data.taken ? "taken" : "idle");
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedUsername, ready, savedUsername, usernameFormatError]);

  const usernameMessage =
    usernameFormatError ??
    (usernameCheck === "taken"
      ? "That username is already taken."
      : usernameCheck === "failed"
        ? "Couldn't check that username. Try again."
        : null);

  const profileError = getOnboardingProfileError({ fullName, username, bio });
  const canContinue = !profileError && usernameCheck === "idle";

  const saveProfile = async () => {
    const problem = getOnboardingProfileError({ fullName, username, bio });
    if (problem) {
      setError(problem);
      return;
    }

    setLoading(true);
    setError(null);
    const result = await saveOnboardingProfile({ fullName, username, bio });
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setUsername(result.data.username);
    setSavedUsername(result.data.username);
    trackActivationEvent({
      event: "onboarding_step_completed",
      metadata: {
        step: "profile",
        has_avatar: Boolean(avatarUrl),
        has_bio: bio.trim().length > 0,
      },
    });
    goToStep("topics");
  };

  const toggleInterest = (label: string) => {
    setInterests((current) => {
      if (current.includes(label)) {
        return current.filter((interest) => interest !== label);
      }
      trackActivationEvent({ event: "interest_selected", metadata: { tag: label } });
      return [...current, label];
    });
    setError(null);
  };

  const finishOnboarding = async (skipped: boolean) => {
    setLoading(true);
    setError(null);

    if (!skipped && interests.join("|") !== savedInterests.join("|")) {
      const saved = await saveOnboardingTopics({ interests });
      if (!saved.ok) {
        setLoading(false);
        setError(saved.error);
        return;
      }
      setSavedInterests(saved.data.interests);
    }

    const completion = await completeOnboarding();
    setLoading(false);

    if (!completion.ok) {
      setError(completion.error);
      return;
    }

    trackActivationEvent({
      event: "onboarding_step_completed",
      metadata: {
        step: "topics",
        skipped,
        topic_count: skipped ? savedInterests.length : interests.length,
      },
    });

    startEnteringApp(() => {
      router.replace("/");
    });
  };

  const goBack = () => {
    goToStep(ONBOARDING_STEPS[Math.max(0, currentIndex - 1)]);
  };

  if (!ready) return null;

  const busy = loading || isEnteringApp;

  return (
    <div className="h-dvh overflow-hidden bg-canvas">
      <div className="mx-auto flex h-full w-full max-w-xl flex-col">
        <header className="flex-shrink-0 px-5 pt-6 sm:px-8 sm:pt-8">
          <div className="flex min-h-11 items-center justify-between">
            {currentIndex > 0 ? (
              <button
                type="button"
                onClick={goBack}
                aria-label="Go back"
                className="flex min-h-11 min-w-11 items-center justify-start rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-emerald-brand"
              >
                <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true">
                  <path d="M9 1L1.5 8L9 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : (
              <span className="min-h-11 min-w-11" />
            )}

            <div
              role="progressbar"
              aria-valuenow={currentIndex + 1}
              aria-valuemin={1}
              aria-valuemax={ONBOARDING_STEPS.length}
              aria-label={`Onboarding step ${currentIndex + 1} of ${ONBOARDING_STEPS.length}`}
              className="flex items-center gap-2"
            >
              {ONBOARDING_STEPS.map((item, index) => (
                <span
                  key={item}
                  aria-hidden="true"
                  className={`rounded-full transition-all ${
                    index === currentIndex
                      ? "h-2.5 w-7 bg-emerald-brand"
                      : index < currentIndex
                        ? "h-2.5 w-2.5 bg-emerald-brand"
                        : "h-2.5 w-2.5 bg-gray-200"
                  }`}
                />
              ))}
            </div>
            <span className="min-h-11 min-w-11" />
          </div>

          <div className="pb-2 pt-3">
            {step === "profile" ? (
              <p className="mb-5 font-display text-lg font-bold text-emerald-brand">{BRAND_NAME}</p>
            ) : null}
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-[26px] font-semibold leading-tight text-ink outline-none"
            >
              {TITLES[step]}
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-ink-muted">{SUBTITLES[step]}</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-4 sm:px-8">
          {step === "profile" ? (
            <div className="space-y-5">
              {userId ? (
                <div>
                  <FieldLabel>Photo (optional)</FieldLabel>
                  <AvatarUploader
                    userId={userId}
                    currentUrl={avatarUrl}
                    fullName={fullName || null}
                    onUpload={(url) => {
                      setAvatarUrl(url);
                      void saveProfileMedia({ avatarUrl: url });
                    }}
                  />
                </div>
              ) : null}

              <label className="block">
                <FieldLabel>Name</FieldLabel>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  maxLength={PROFILE_NAME_MAX_LENGTH}
                  autoComplete="name"
                  placeholder="Your name"
                  className={INPUT_STYLES}
                />
              </label>

              <label className="block">
                <FieldLabel>Username</FieldLabel>
                <input
                  value={username}
                  onChange={(event) =>
                    setUsername(normalizeProfileUsername(event.target.value))
                  }
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="yourname"
                  aria-invalid={usernameMessage ? true : undefined}
                  aria-describedby="onboarding-username-help"
                  className={INPUT_STYLES}
                />
                <span
                  id="onboarding-username-help"
                  className={`mt-1.5 block text-xs leading-5 ${
                    usernameMessage ? "text-red-600" : "text-ink-muted"
                  }`}
                >
                  {usernameMessage ??
                    (usernameCheck === "checking"
                      ? "Checking availability…"
                      : `Your profile will live at /${normalizedUsername || "username"}.`)}
                </span>
              </label>

              <label className="block">
                <FieldLabel>Bio (optional)</FieldLabel>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  maxLength={PROFILE_BIO_MAX_LENGTH}
                  placeholder="A line or two about you and what you write about"
                  className={`${INPUT_STYLES} resize-none`}
                />
                <span className="mt-1.5 block text-right text-xs text-ink-muted">
                  {bio.length}/{PROFILE_BIO_MAX_LENGTH}
                </span>
              </label>
            </div>
          ) : null}

          {step === "topics" ? (
            <div>
              <p className="mb-4 text-xs text-ink-muted" aria-live="polite">
                {interests.length === 0
                  ? "No topics selected"
                  : `${interests.length} selected`}
              </p>
              <div className="flex flex-wrap gap-2.5">
                {INTEREST_OPTIONS.map((option) => {
                  const selected = interests.includes(option.label);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleInterest(option.label)}
                      className={`min-h-11 rounded-full border px-4 py-2.5 text-[13.5px] font-medium outline-none transition-colors focus:ring-4 focus:ring-purple-tint ${
                        selected
                          ? "border-purple-accent bg-purple-accent font-semibold text-white"
                          : "border-card-border bg-card text-ink hover:border-purple-accent/40"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </main>

        <footer
          className="flex-shrink-0 border-t border-card-border bg-card px-5 pt-3.5 sm:px-8"
          style={{ paddingBottom: "max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))" }}
        >
          <div aria-live="polite" aria-atomic="true">
            {error ? <p className="mb-3 text-sm text-red-600" role="alert">{error}</p> : null}
          </div>

          {step === "topics" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void finishOnboarding(false)}
                disabled={busy}
                aria-busy={busy || undefined}
                className="flex min-h-12 items-center justify-center rounded-xl bg-emerald-brand px-4 text-sm font-semibold text-white outline-none transition-opacity focus:ring-4 focus:ring-green-tint disabled:cursor-not-allowed disabled:opacity-50 sm:order-2"
              >
                {isEnteringApp ? "Opening…" : loading ? "Finishing…" : "Finish"}
              </button>
              <button
                type="button"
                onClick={() => void finishOnboarding(true)}
                disabled={busy}
                className="flex min-h-12 items-center justify-center rounded-xl border border-card-border bg-card px-4 text-sm font-semibold text-ink outline-none transition-colors hover:bg-canvas focus:ring-4 focus:ring-green-tint disabled:cursor-not-allowed disabled:opacity-50 sm:order-1"
              >
                Skip for now
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void saveProfile()}
              disabled={loading || !canContinue}
              aria-busy={loading || undefined}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-brand px-4 text-sm font-semibold text-white outline-none transition-opacity focus:ring-4 focus:ring-green-tint disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Saving…" : "Continue"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
