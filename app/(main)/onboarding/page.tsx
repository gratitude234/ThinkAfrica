"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import FollowButton from "@/components/ui/FollowButton";
import UniversitySelect from "@/components/ui/UniversitySelect";
import UserAvatar from "@/components/ui/UserAvatar";
import { trackActivationEvent } from "@/lib/activationEvents";
import { AFRICAN_COUNTRIES } from "@/lib/academicIdentity";
import { INTEREST_OPTIONS, MIN_INTERESTS, MAX_INTERESTS } from "@/lib/interests";
import { PersonaIcon } from "@/lib/personaIcons";
import {
  PROFILE_TYPE_OPTIONS,
  type ProfileType,
  isAcademicProfileType,
  isProfileType,
  normalizeSecondaryProfileTypes,
} from "@/lib/profileTypes";

interface SuggestedProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  university: string | null;
  field_of_study?: string | null;
  avatar_url: string | null;
  points: number | null;
}

type Step = "persona" | "identity" | "interests" | "follow";
const STEP_ORDER: Step[] = ["persona", "identity", "interests", "follow"];

const INPUT_STYLES =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-ink shadow-sm transition-colors placeholder:text-gray-400 focus:border-emerald-brand focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-gray-50";

function parseStepParam(value: string | null): Step | null {
  return value && (STEP_ORDER as string[]).includes(value) ? (value as Step) : null;
}

function isIdentityStepComplete(
  profileType: ProfileType | null,
  country: string,
  university: string,
  fieldOfStudy: string
) {
  if (!profileType) return false;
  if (isAcademicProfileType(profileType)) {
    return Boolean(country.trim() && university.trim() && fieldOfStudy.trim());
  }
  return Boolean(country.trim());
}

function getFurthestStepIndex(snapshot: {
  profileType: ProfileType | null;
  country: string;
  university: string;
  fieldOfStudy: string;
  interests: string[];
}) {
  if (!snapshot.profileType) return 0;
  if (
    !isIdentityStepComplete(
      snapshot.profileType,
      snapshot.country,
      snapshot.university,
      snapshot.fieldOfStudy
    )
  ) {
    return 1;
  }
  if (snapshot.interests.length < MIN_INTERESTS) return 2;
  return 3;
}

function trackStepCompleted(step: Step) {
  trackActivationEvent({
    event: "onboarding_step_completed",
    metadata: { step },
  });
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
      {children}
    </p>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("persona");
  const [ready, setReady] = useState(false);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);

  const [profileType, setProfileType] = useState<ProfileType | null>(null);
  const [secondaryProfileTypes, setSecondaryProfileTypes] = useState<ProfileType[]>([]);
  const [country, setCountry] = useState("");
  const [university, setUniversity] = useState("");
  const [fieldOfStudy, setFieldOfStudy] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedProfile[]>([]);

  const currentIndex = STEP_ORDER.indexOf(step);
  const isAcademicProfile = isAcademicProfileType(profileType);

  const goToStep = useCallback(
    (nextStep: Step) => {
      setStep(nextStep);
      router.replace(`/onboarding?step=${nextStep}`);
    },
    [router]
  );

  const selectPrimaryProfileType = (nextType: ProfileType) => {
    setProfileType(nextType);
    setSecondaryProfileTypes((current) =>
      normalizeSecondaryProfileTypes(current, nextType)
    );
  };

  const toggleSecondaryProfileType = (nextType: ProfileType) => {
    if (nextType === profileType) return;
    setSecondaryProfileTypes((current) => {
      if (current.includes(nextType)) {
        return current.filter((item) => item !== nextType);
      }
      if (current.length >= 3) return current;
      return [...current, nextType];
    });
  };

  const handleCountryChange = (nextCountry: string) => {
    if (nextCountry !== country) {
      setUniversity("");
    }
    setCountry(nextCountry);
  };

  const toggleInterest = (label: string) => {
    setInterests((prev) => {
      if (prev.includes(label)) {
        return prev.filter((item) => item !== label);
      }
      if (prev.length >= MAX_INTERESTS) return prev;
      trackActivationEvent({ event: "interest_selected", metadata: { tag: label } });
      return [...prev, label];
    });
  };

  const loadSuggestions = useCallback(
    async (currentUserId: string, userUniversity: string | null, userField: string | null) => {
      setLoadingSuggestions(true);
      const supabase = createClient();

      const { data: followingRows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", currentUserId)
        .limit(1000);

      const alreadyFollowing = new Set(
        ((followingRows ?? []) as Array<{ following_id: string }>).map(
          (row) => row.following_id
        )
      );

      async function runProfileQuery(matchProfile: boolean) {
        let query = supabase
          .from("profiles")
          .select("id, username, full_name, university, field_of_study, avatar_url, points")
          .neq("id", currentUserId)
          .order("points", { ascending: false })
          .limit(36);

        if (matchProfile && userUniversity && userField) {
          query = query.eq("university", userUniversity).eq("field_of_study", userField);
        }

        const { data } = await query;
        return ((data ?? []) as SuggestedProfile[])
          .filter((profile) => !alreadyFollowing.has(profile.id))
          .slice(0, 12);
      }

      const matched = await runProfileQuery(Boolean(userUniversity && userField));
      const nextSuggestions =
        matched.length > 0 ? matched : await runProfileQuery(false);

      setSuggestions(nextSuggestions);
      setLoadingSuggestions(false);
    },
    []
  );

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);
      trackActivationEvent({ event: "onboarding_started" });

      const { data: profile } = await supabase
        .from("profiles")
        .select(
          "profile_type, secondary_profile_types, country, university, field_of_study, interests, onboarding_completed"
        )
        .eq("id", user.id)
        .single();

      const requestedStep = parseStepParam(searchParams.get("step"));

      if (profile?.onboarding_completed && !requestedStep) {
        router.push("/");
        return;
      }
      setAlreadyCompleted(Boolean(profile?.onboarding_completed));

      const nextProfileType = isProfileType(profile?.profile_type)
        ? profile.profile_type
        : null;
      const nextSecondary = normalizeSecondaryProfileTypes(
        (profile?.secondary_profile_types as string[] | null) ?? [],
        nextProfileType
      );
      const nextCountry = profile?.country ?? "";
      const nextUniversity = profile?.university ?? "";
      const nextFieldOfStudy = profile?.field_of_study ?? "";
      const nextInterests = (profile?.interests as string[] | null) ?? [];

      setProfileType(nextProfileType);
      setSecondaryProfileTypes(nextSecondary);
      setCountry(nextCountry);
      setUniversity(nextUniversity);
      setFieldOfStudy(nextFieldOfStudy);
      setInterests(nextInterests);

      const furthestIndex = getFurthestStepIndex({
        profileType: nextProfileType,
        country: nextCountry,
        university: nextUniversity,
        fieldOfStudy: nextFieldOfStudy,
        interests: nextInterests,
      });
      const requestedIndex = requestedStep ? STEP_ORDER.indexOf(requestedStep) : furthestIndex;
      const resolvedStep = STEP_ORDER[Math.min(requestedIndex, furthestIndex)];

      setStep(resolvedStep);
      if (searchParams.get("step") !== resolvedStep) {
        router.replace(`/onboarding?step=${resolvedStep}`);
      }
      if (resolvedStep === "follow") {
        await loadSuggestions(user.id, nextUniversity, nextFieldOfStudy);
      }
      setReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePersona = async () => {
    if (!userId || !profileType) {
      setError("Choose the profile type that best describes you.");
      return;
    }

    const nextSecondaryProfileTypes = normalizeSecondaryProfileTypes(
      secondaryProfileTypes,
      profileType
    );

    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        profile_type: profileType,
        secondary_profile_types: nextSecondaryProfileTypes,
      })
      .eq("id", userId);

    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSecondaryProfileTypes(nextSecondaryProfileTypes);
    trackActivationEvent({
      event: "onboarding_step_completed",
      metadata: { step: "persona", profile_type: profileType },
    });
    goToStep("identity");
  };

  const saveIdentity = async () => {
    if (!userId || !profileType) return;
    const academic = isAcademicProfileType(profileType);

    if (!country.trim()) {
      setError("Add your country.");
      return;
    }
    if (academic && (!university.trim() || !fieldOfStudy.trim())) {
      setError("Add your university and field of study.");
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        country: country.trim(),
        university: academic ? university.trim() : null,
        field_of_study: academic ? fieldOfStudy.trim() : null,
      })
      .eq("id", userId);

    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    trackStepCompleted("identity");
    goToStep("interests");
  };

  const saveInterestsAndContinue = async () => {
    if (!userId) return;
    if (interests.length < MIN_INTERESTS) {
      setError("Choose at least one topic to continue.");
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ interests })
      .eq("id", userId);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    await loadSuggestions(userId, university, fieldOfStudy);
    setLoading(false);
    trackStepCompleted("interests");
    goToStep("follow");
  };

  const completeOnboarding = async () => {
    if (!userId) return;

    const furthestIndex = getFurthestStepIndex({
      profileType,
      country,
      university,
      fieldOfStudy,
      interests,
    });
    if (furthestIndex < STEP_ORDER.length - 1) {
      goToStep(STEP_ORDER[furthestIndex]);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", userId);
    if (!alreadyCompleted) {
      trackActivationEvent({ event: "onboarding_completed" });
    }
    setLoading(false);
    router.push(alreadyCompleted ? "/" : "/?welcome=1");
  };

  const goBack = () => {
    goToStep(STEP_ORDER[Math.max(currentIndex - 1, 0)]);
  };

  const canContinue =
    step === "persona"
      ? Boolean(profileType)
      : step === "identity"
        ? isAcademicProfile
          ? Boolean(country.trim() && university.trim() && fieldOfStudy.trim())
          : Boolean(country.trim())
        : step === "interests"
          ? interests.length >= MIN_INTERESTS
          : true;

  const ctaHandlers: Record<Step, () => void> = {
    persona: savePersona,
    identity: saveIdentity,
    interests: saveInterestsAndContinue,
    follow: completeOnboarding,
  };

  const titles: Record<Step, string> = {
    persona: "What best describes you?",
    identity: isAcademicProfile ? "Tell us where you study" : "Where are you based?",
    interests: "What are you interested in?",
    follow: "Follow a few thinkers",
  };

  const subtitles: Record<Step, string> = {
    persona: "Choose the profile that fits best. You can add more roles later.",
    identity: isAcademicProfile
      ? "This helps us verify your academic credentials."
      : "Just your country, we'll keep this quick.",
    interests: "Pick up to 6 topics to personalize your feed.",
    follow: "Get to know people shaping conversations in your fields.",
  };

  if (!ready) {
    return null;
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
        <div className="flex-shrink-0 px-5 pt-8">
          <div className="flex h-7 items-center justify-between">
            {currentIndex > 0 ? (
              <button
                type="button"
                onClick={goBack}
                aria-label="Back"
                className="flex h-7 w-7 items-center justify-center"
              >
                <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true">
                  <path
                    d="M9 1L1.5 8L9 15"
                    stroke="#1A1A1A"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : (
              <span className="h-7 w-7" />
            )}

            <div
              role="progressbar"
              aria-valuenow={currentIndex + 1}
              aria-valuemin={1}
              aria-valuemax={STEP_ORDER.length}
              aria-label={`Onboarding step ${currentIndex + 1} of ${STEP_ORDER.length}`}
              className="flex items-center gap-1.5"
            >
              {STEP_ORDER.map((s, index) => (
                <span
                  key={s}
                  aria-hidden="true"
                  className={`rounded-full transition-all ${
                    index === currentIndex
                      ? "h-2.5 w-2.5 bg-emerald-brand ring-4 ring-emerald-brand/20"
                      : index < currentIndex
                        ? "h-2 w-2 bg-emerald-brand"
                        : "h-2 w-2 bg-gray-200"
                  }`}
                />
              ))}
            </div>

            <div className="flex h-7 w-7 items-center justify-end">
              {step === "follow" ? (
                <button
                  type="button"
                  onClick={completeOnboarding}
                  className="text-xs font-medium text-ink-muted hover:text-ink"
                >
                  Skip
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 px-5 pb-1 pt-4">
          {step === "persona" ? (
            <p className="font-display mb-3.5 text-lg font-bold text-emerald-brand">
              Indegenius
            </p>
          ) : null}
          <h1 className="font-display text-[22px] font-semibold leading-tight text-ink">
            {titles[step]}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{subtitles[step]}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {step === "persona" ? (
            <>
              <div className="grid grid-cols-3 gap-2.5">
                {PROFILE_TYPE_OPTIONS.map((option) => {
                  const selected = option.value === profileType;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => selectPrimaryProfileType(option.value)}
                      className={`relative flex min-h-[104px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-1.5 py-3.5 text-center transition-colors ${
                        selected
                          ? "border-emerald-brand bg-emerald-brand/[0.07]"
                          : "border-gray-200 bg-white hover:border-emerald-brand/40"
                      }`}
                    >
                      {selected ? (
                        <span
                          aria-hidden="true"
                          className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-brand text-[9px] font-bold text-white"
                        >
                          ✓
                        </span>
                      ) : null}
                      <PersonaIcon type={option.value} color={selected ? "#073929" : "#6B6B6B"} />
                      <span
                        className={`text-[12.5px] leading-tight text-ink ${
                          selected ? "font-semibold" : "font-medium"
                        }`}
                      >
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {profileType ? (
                <div className="mt-6">
                  <p className="mb-0.5 text-xs font-semibold text-ink">
                    Also describe yourself as
                  </p>
                  <p className="mb-2.5 text-xs text-ink-muted">
                    Optional, up to 3. {secondaryProfileTypes.length}/3 selected.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PROFILE_TYPE_OPTIONS.filter((option) => option.value !== profileType).map(
                      (option) => {
                        const selected = secondaryProfileTypes.includes(option.value);
                        const disabled = !selected && secondaryProfileTypes.length >= 3;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected}
                            disabled={disabled}
                            onClick={() => toggleSecondaryProfileType(option.value)}
                            className={`rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                              selected
                                ? "border-gold bg-gold-tint text-ink font-semibold"
                                : "border-gray-200 bg-white text-ink hover:border-gold/50"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {step === "identity" ? (
            <div className="flex flex-col gap-[18px]">
              <div>
                <FieldLabel>Country</FieldLabel>
                <select
                  value={country}
                  onChange={(event) => handleCountryChange(event.target.value)}
                  className={INPUT_STYLES}
                >
                  <option value="">Select country</option>
                  {AFRICAN_COUNTRIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              {isAcademicProfile ? (
                <>
                  <div>
                    <FieldLabel>University</FieldLabel>
                    <UniversitySelect
                      value={university}
                      onChange={setUniversity}
                      country={country}
                      disabled={!country}
                    />
                  </div>
                  <div>
                    <FieldLabel>Field of study</FieldLabel>
                    <input
                      value={fieldOfStudy}
                      onChange={(event) => setFieldOfStudy(event.target.value)}
                      placeholder="e.g. Public Health"
                      className={INPUT_STYLES}
                    />
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {step === "interests" ? (
            <div>
              <div className="mb-2.5 flex justify-end">
                <span className="rounded-full bg-gold-tint px-2.5 py-1 text-xs font-semibold text-gold-ink">
                  {interests.length}/{MAX_INTERESTS}
                </span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {INTEREST_OPTIONS.map((option) => {
                  const selected = interests.includes(option.label);
                  const disabled = !selected && interests.length >= MAX_INTERESTS;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      disabled={disabled}
                      onClick={() => toggleInterest(option.label)}
                      className={`rounded-full border px-4 py-2.5 text-[13.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        selected
                          ? "border-purple-accent bg-purple-accent font-semibold text-white"
                          : "border-gray-200 bg-white text-ink hover:border-purple-accent/40"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === "follow" ? (
            <div>
              {loadingSuggestions ? (
                <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-ink-muted">
                  Finding suggested people...
                </div>
              ) : suggestions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-ink-muted">
                  No suggestions yet. You can still continue and explore the latest posts.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  {suggestions.map((profile, index) => (
                    <div
                      key={profile.id}
                      className={`flex items-center gap-3 px-4 py-3.5 ${
                        index < suggestions.length - 1 ? "border-b border-gray-100" : ""
                      }`}
                    >
                      <UserAvatar
                        name={profile.full_name ?? profile.username ?? "Anonymous"}
                        src={profile.avatar_url}
                        size={40}
                        className="shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {profile.full_name ?? profile.username ?? "Anonymous"}
                        </p>
                        {profile.university ? (
                          <p className="mt-0.5 truncate text-xs text-purple-accent">
                            {profile.university}
                          </p>
                        ) : null}
                      </div>
                      {userId ? (
                        <FollowButton followerId={userId} followingId={profile.id} />
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex-shrink-0 border-t border-gray-200 bg-white px-5 pt-3.5">
          {error ? (
            <p className="mb-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={ctaHandlers[step]}
            disabled={loading || !canContinue}
            className="mb-4 flex h-12 w-full items-center justify-center rounded-xl bg-emerald-brand text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Saving..." : step === "follow" ? "Finish setup" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
