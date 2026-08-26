"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import UniversitySelect from "@/components/ui/UniversitySelect";
import { trackActivationEvent } from "@/lib/activationEvents";
import { AFRICAN_COUNTRIES } from "@/lib/academicIdentity";
import { BRAND_NAME, BRAND_PROMISE } from "@/lib/brand";
import { INTEREST_OPTIONS } from "@/lib/interests";
import {
  deriveLegacyOnboardingPreference,
  normalizeOnboardingPreference,
  ONBOARDING_MAX_TOPICS,
  ONBOARDING_MIN_TOPICS,
  ONBOARDING_STEPS,
  parseOnboardingStep,
  WORK_CATEGORY_OPTIONS,
  type OnboardingPath,
  type OnboardingStep,
  type WorkCategory,
} from "@/lib/onboarding";
import { normalizeMyPrivateProfile } from "@/lib/profilePrivate";
import { normalizeProfileRecordSummary } from "@/lib/profileRecord";
import {
  getVisibleProfileRecordMetrics,
  profileRecordMetricGridClass,
} from "@/lib/profileRecordMetrics";
import { isProfileType, type ProfileType } from "@/lib/profileTypes";
import { createClient } from "@/lib/supabase/client";

interface OnboardingClientProps {
  requestedStep: string | null;
}

interface ProfileSnapshot {
  full_name: string | null;
  profile_type: string | null;
  country: string | null;
  university: string | null;
  field_of_study: string | null;
  graduation_year: number | null;
  professional_title: string | null;
  organization_name: string | null;
  interests: string[] | null;
}

interface RecordStats {
  publicationCount: number;
  sourceBackedCount: number;
  citableCount: number;
}

const EMPTY_RECORD: RecordStats = {
  publicationCount: 0,
  sourceBackedCount: 0,
  citableCount: 0,
};

const INPUT_STYLES =
  "min-h-12 w-full rounded-xl border border-card-border bg-card px-4 py-3 text-sm text-ink shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-ink-muted focus:border-emerald-brand focus:ring-4 focus:ring-green-tint disabled:cursor-not-allowed disabled:bg-gray-50";

function hasText(value: string) {
  return value.trim().length > 0;
}

function identityComplete(snapshot: {
  currentPath: OnboardingPath | null;
  workCategory: WorkCategory | null;
  country: string;
  university: string;
  fieldOfStudy: string;
  professionalTitle: string;
}) {
  if (!snapshot.currentPath || !hasText(snapshot.country)) return false;
  if (snapshot.currentPath === "student") {
    return hasText(snapshot.university) && hasText(snapshot.fieldOfStudy);
  }
  return Boolean(snapshot.workCategory && hasText(snapshot.professionalTitle));
}

function getFurthestStep(snapshot: {
  currentPath: OnboardingPath | null;
  workCategory: WorkCategory | null;
  country: string;
  university: string;
  fieldOfStudy: string;
  professionalTitle: string;
  interests: string[];
}): OnboardingStep {
  if (!snapshot.currentPath) return "path";
  if (!identityComplete(snapshot)) return "identity";
  if (
    snapshot.interests.length < ONBOARDING_MIN_TOPICS ||
    snapshot.interests.length > ONBOARDING_MAX_TOPICS
  ) {
    return "topics";
  }
  return "record";
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
      {children}
    </span>
  );
}

function SelectionCheck() {
  return (
    <span
      aria-hidden="true"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-brand text-xs font-bold text-white"
    >
      ✓
    </span>
  );
}

function formatInterests(interests: string[]) {
  if (interests.length <= 1) return interests[0] ?? "";
  if (interests.length === 2) return `${interests[0]} and ${interests[1]}`;
  return `${interests.slice(0, -1).join(", ")} and ${interests.at(-1)}`;
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
  const [step, setStep] = useState<OnboardingStep>("path");
  const [fullName, setFullName] = useState("Your name");
  const [currentPath, setCurrentPath] = useState<OnboardingPath | null>(null);
  const [workCategory, setWorkCategory] = useState<WorkCategory | null>(null);
  const [country, setCountry] = useState("");
  const [university, setUniversity] = useState("");
  const [fieldOfStudy, setFieldOfStudy] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [professionalTitle, setProfessionalTitle] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [recordStats, setRecordStats] = useState<RecordStats>(EMPTY_RECORD);

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
    const supabase = createClient();

    async function loadOnboarding() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      if (!trackedStartRef.current) {
        trackedStartRef.current = true;
        trackActivationEvent({ event: "onboarding_started" });
      }

      const [
        profileResult,
        privateProfileResult,
        preferenceResult,
        recordResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "full_name, profile_type, country, university, field_of_study, graduation_year, professional_title, organization_name, interests"
          )
          .eq("id", user.id)
          .single(),
        supabase.rpc("get_my_profile_private"),
        supabase.rpc("get_my_onboarding_state"),
        supabase.rpc("get_public_profile_record_summary", {
          p_profile_id: user.id,
          p_include_research: false,
        }),
      ]);

      if (cancelled) return;

      const privateProfile = normalizeMyPrivateProfile(privateProfileResult.data);
      if (privateProfile?.onboarding_completed) {
        router.replace(
          requestedStepRef.current === "follow" ? "/explore?tab=people" : "/"
        );
        return;
      }

      if (profileResult.error || !profileResult.data) {
        setError("We couldn't load your profile. Please refresh and try again.");
        setReady(true);
        return;
      }

      if (recordResult.error) {
        setError(
          "We couldn't load your Intellectual Record. Please refresh and try again."
        );
        setReady(true);
        return;
      }

      const profile = profileResult.data as ProfileSnapshot;
      const storedPreference = normalizeOnboardingPreference(preferenceResult.data);
      const legacyProfileType: ProfileType | null = isProfileType(profile.profile_type)
        ? profile.profile_type
        : null;
      const legacyPreference = deriveLegacyOnboardingPreference(legacyProfileType);
      const nextPath = storedPreference.currentPath ?? legacyPreference.currentPath;
      const nextCategory = storedPreference.workCategory ?? legacyPreference.workCategory;
      const nextInterests = (profile.interests ?? []).filter((interest) =>
        INTEREST_OPTIONS.some((option) => option.label === interest)
      );

      setUserId(user.id);
      setFullName(profile.full_name?.trim() || "Your name");
      setCurrentPath(nextPath);
      setWorkCategory(nextCategory);
      setCountry(profile.country ?? "");
      setUniversity(profile.university ?? "");
      setFieldOfStudy(profile.field_of_study ?? "");
      setGraduationYear(profile.graduation_year?.toString() ?? "");
      setProfessionalTitle(profile.professional_title ?? "");
      setOrganizationName(profile.organization_name ?? "");
      setInterests(nextInterests.slice(0, ONBOARDING_MAX_TOPICS));

      const summary = normalizeProfileRecordSummary(recordResult.data);
      setRecordStats({
        publicationCount: summary.publicationCount,
        sourceBackedCount: summary.sourceBackedCount,
        citableCount: summary.citableCount,
      });

      const furthestStep = getFurthestStep({
        currentPath: nextPath,
        workCategory: nextCategory,
        country: profile.country ?? "",
        university: profile.university ?? "",
        fieldOfStudy: profile.field_of_study ?? "",
        professionalTitle: profile.professional_title ?? "",
        interests: nextInterests,
      });
      const initialRequestedStep = requestedStepRef.current;
      const requested = parseOnboardingStep(initialRequestedStep);
      const requestedIndex = requested
        ? ONBOARDING_STEPS.indexOf(requested)
        : ONBOARDING_STEPS.indexOf(furthestStep);
      const resolvedStep = ONBOARDING_STEPS[
        Math.min(requestedIndex, ONBOARDING_STEPS.indexOf(furthestStep))
      ];

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

  const selectPath = (nextPath: OnboardingPath) => {
    if (nextPath !== currentPath) setWorkCategory(null);
    setCurrentPath(nextPath);
    setError(null);
  };

  const savePath = async () => {
    if (!currentPath) {
      setError("Choose whether you are currently a student.");
      return;
    }

    setLoading(true);
    setError(null);
    const { error: saveError } = await createClient().rpc("save_onboarding_path", {
      p_current_path: currentPath,
    });
    setLoading(false);

    if (saveError) {
      setError("We couldn't save your choice. Please try again.");
      return;
    }

    trackActivationEvent({
      event: "onboarding_step_completed",
      metadata: { step: "path", current_path: currentPath },
    });
    goToStep("identity");
  };

  const saveIdentity = async () => {
    if (!userId || !currentPath) return;

    if (!hasText(country)) {
      setError("Add your country.");
      return;
    }
    if (currentPath === "student" && (!hasText(university) || !hasText(fieldOfStudy))) {
      setError("Add your school and field of study.");
      return;
    }
    if (currentPath === "non_student" && (!workCategory || !hasText(professionalTitle))) {
      setError("Choose your work area and add a professional headline.");
      return;
    }

    const parsedGraduationYear = graduationYear.trim() ? Number(graduationYear) : null;
    if (
      parsedGraduationYear !== null &&
      (!Number.isInteger(parsedGraduationYear) ||
        parsedGraduationYear < 1900 ||
        parsedGraduationYear > 2200)
    ) {
      setError("Choose a valid graduation year.");
      return;
    }

    setLoading(true);
    setError(null);
    const { error: saveError } = await createClient().rpc("save_onboarding_identity", {
      p_current_path: currentPath,
      p_work_category: currentPath === "non_student" ? workCategory : null,
      p_country: country,
      p_university: currentPath === "student" ? university : null,
      p_field_of_study: currentPath === "student" ? fieldOfStudy : null,
      p_graduation_year: currentPath === "student" ? parsedGraduationYear : null,
      p_professional_title: currentPath === "non_student" ? professionalTitle : null,
      p_organization_name: currentPath === "non_student" ? organizationName : null,
    });
    setLoading(false);

    if (saveError) {
      setError("We couldn't save your profile details. Please try again.");
      return;
    }

    trackActivationEvent({
      event: "onboarding_step_completed",
      metadata: {
        step: "identity",
        current_path: currentPath,
        work_category: currentPath === "non_student" ? workCategory : null,
      },
    });
    goToStep("topics");
  };

  const toggleInterest = (label: string) => {
    setInterests((current) => {
      if (current.includes(label)) {
        return current.filter((interest) => interest !== label);
      }
      if (current.length >= ONBOARDING_MAX_TOPICS) return current;
      trackActivationEvent({ event: "interest_selected", metadata: { tag: label } });
      return [...current, label];
    });
    setError(null);
  };

  const saveTopics = async () => {
    if (
      interests.length < ONBOARDING_MIN_TOPICS ||
      interests.length > ONBOARDING_MAX_TOPICS
    ) {
      setError("Choose 3 to 5 topics.");
      return;
    }

    setLoading(true);
    setError(null);
    const { error: saveError } = await createClient().rpc("save_onboarding_topics", {
      p_interests: interests,
    });
    setLoading(false);

    if (saveError) {
      setError("We couldn't save your topics. Please try again.");
      return;
    }

    trackActivationEvent({
      event: "onboarding_step_completed",
      metadata: { step: "topics", topic_count: interests.length },
    });
    goToStep("record");
  };

  const finishOnboarding = async (destination: "write" | "explore") => {
    if (!userId) return;
    const furthestStep = getFurthestStep({
      currentPath,
      workCategory,
      country,
      university,
      fieldOfStudy,
      professionalTitle,
      interests,
    });
    if (furthestStep !== "record") {
      goToStep(furthestStep);
      return;
    }

    setLoading(true);
    setError(null);
    const { error: completionError } = await createClient().rpc("complete_onboarding");
    setLoading(false);

    if (completionError) {
      setError("We couldn't finish your setup. Your information is saved, so you can try again.");
      return;
    }

    trackActivationEvent({
      event: "next_action_clicked",
      metadata: {
        source: "onboarding_record",
        action: destination,
        current_path: currentPath,
        work_category: currentPath === "non_student" ? workCategory : null,
      },
    });

    startEnteringApp(() => {
      router.push(
        destination === "write"
          ? "/write?returnTo=%2F%3Fwelcome%3D1"
          : "/explore?welcome=1"
      );
    });
  };

  const goBack = () => {
    const previousStep = ONBOARDING_STEPS[Math.max(0, currentIndex - 1)];
    goToStep(previousStep);
  };

  const handleCountryChange = (nextCountry: string) => {
    if (currentPath === "student" && nextCountry !== country) setUniversity("");
    setCountry(nextCountry);
  };

  if (!ready) return null;

  const titles: Record<OnboardingStep, string> = {
    path: "Are you currently a student?",
    identity: currentPath === "student" ? "Add your school identity" : "Tell us about your work",
    topics: "What do you want to read and write about?",
    record: "Your Intellectual Record",
  };
  const subtitles: Record<OnboardingStep, string> = {
    path: "This helps us set up your profile. It won’t limit what you can publish.",
    identity:
      currentPath === "student"
        ? "Give readers useful context for the ideas you publish."
        : "Use your own words for the identity readers will see.",
    topics: "Choose 3–5 topics to shape your starting feed and suggestions.",
    record: "This is the public body of work you will build over time.",
  };

  // One rule decides which metrics are worth showing, on every surface. The
  // preview is a picture of a profile rather than a profile, so it takes the
  // unlinked form.
  const previewMetrics = getVisibleProfileRecordMetrics(recordStats);

  const canContinue =
    step === "path"
      ? Boolean(currentPath)
      : step === "identity"
        ? identityComplete({
            currentPath,
            workCategory,
            country,
            university,
            fieldOfStudy,
            professionalTitle,
          })
        : step === "topics"
          ? interests.length >= ONBOARDING_MIN_TOPICS && interests.length <= ONBOARDING_MAX_TOPICS
          : true;

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
            {step === "path" ? (
              <div className="mb-5">
                <p className="font-display text-lg font-bold text-emerald-brand">{BRAND_NAME}</p>
                <p className="mt-0.5 text-xs font-medium text-ink-muted">{BRAND_PROMISE}</p>
              </div>
            ) : null}
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-[26px] font-semibold leading-tight text-ink outline-none"
            >
              {titles[step]}
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-ink-muted">{subtitles[step]}</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-4 sm:px-8">
          {step === "path" ? (
            <div className="grid gap-3">
              {[
                {
                  value: "student" as const,
                  title: "Yes, I’m a student",
                  body: "Connect your school and field of study to your record.",
                },
                {
                  value: "non_student" as const,
                  title: "No, I’m not currently a student",
                  body: "Set up a professional identity in your own words.",
                },
              ].map((option) => {
                const selected = currentPath === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectPath(option.value)}
                    className={`flex min-h-[92px] items-center gap-4 rounded-2xl border p-4 text-left outline-none transition-[border-color,background-color,box-shadow] focus:ring-4 focus:ring-green-tint ${
                      selected
                        ? "border-emerald-brand bg-green-tint"
                        : "border-card-border bg-card hover:border-card-border-hover"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{option.title}</span>
                      <span className="mt-1 block text-sm leading-5 text-ink-muted">{option.body}</span>
                    </span>
                    {selected ? <SelectionCheck /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {step === "identity" ? (
            <div className="space-y-5">
              {currentPath === "non_student" ? (
                <fieldset>
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    What best describes your work right now?
                  </legend>
                  <div className="grid gap-2">
                    {WORK_CATEGORY_OPTIONS.map((option) => {
                      const selected = workCategory === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setWorkCategory(option.value)}
                          className={`flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 text-left outline-none transition-colors focus:ring-4 focus:ring-green-tint ${
                            selected
                              ? "border-emerald-brand bg-green-tint"
                              : "border-card-border bg-card hover:border-card-border-hover"
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-ink">{option.label}</span>
                            <span className="mt-0.5 block text-xs leading-5 text-ink-muted">{option.description}</span>
                          </span>
                          {selected ? <SelectionCheck /> : null}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}

              <label className="block">
                <FieldLabel>Country</FieldLabel>
                <input
                  list="country-options"
                  value={country}
                  onChange={(event) => handleCountryChange(event.target.value)}
                  autoComplete="country-name"
                  placeholder="e.g. Nigeria"
                  className={INPUT_STYLES}
                />
                <datalist id="country-options">
                  {AFRICAN_COUNTRIES.map((item) => <option key={item} value={item} />)}
                </datalist>
              </label>

              {currentPath === "student" ? (
                <>
                  <label className="block">
                    <FieldLabel>School</FieldLabel>
                    <UniversitySelect
                      value={university}
                      onChange={setUniversity}
                      country={country}
                      disabled={!hasText(country)}
                      placeholder="Search for your school"
                      className="[&_input]:min-h-12 [&_input]:rounded-xl [&_input]:border-card-border [&_input]:px-4"
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Field of study</FieldLabel>
                    <input
                      value={fieldOfStudy}
                      onChange={(event) => setFieldOfStudy(event.target.value)}
                      placeholder="e.g. Political Science"
                      className={INPUT_STYLES}
                    />
                  </label>
                  <label className="block">
                    <FieldLabel>Graduation year (optional)</FieldLabel>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1900}
                      max={2200}
                      value={graduationYear}
                      onChange={(event) => setGraduationYear(event.target.value)}
                      placeholder="e.g. 2028"
                      className={INPUT_STYLES}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="block">
                    <FieldLabel>Professional headline</FieldLabel>
                    <input
                      value={professionalTitle}
                      onChange={(event) => setProfessionalTitle(event.target.value)}
                      maxLength={120}
                      placeholder="e.g. Policy researcher and climate advocate"
                      className={INPUT_STYLES}
                    />
                    <span className="mt-1.5 block text-xs leading-5 text-ink-muted">
                      Describe what you do in words that feel natural to you.
                    </span>
                  </label>
                  <label className="block">
                    <FieldLabel>Organisation (optional)</FieldLabel>
                    <input
                      value={organizationName}
                      onChange={(event) => setOrganizationName(event.target.value)}
                      maxLength={160}
                      placeholder="e.g. Civic Futures Lab"
                      className={INPUT_STYLES}
                    />
                  </label>
                </>
              )}
            </div>
          ) : null}

          {step === "topics" ? (
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs text-ink-muted">Select at least 3</p>
                <span className="rounded-full bg-gold-tint px-3 py-1 text-xs font-semibold text-gold-ink">
                  {interests.length}/{ONBOARDING_MAX_TOPICS}
                </span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {INTEREST_OPTIONS.map((option) => {
                  const selected = interests.includes(option.label);
                  const disabled = !selected && interests.length >= ONBOARDING_MAX_TOPICS;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      disabled={disabled}
                      onClick={() => toggleInterest(option.label)}
                      className={`min-h-11 rounded-full border px-4 py-2.5 text-[13.5px] font-medium outline-none transition-colors focus:ring-4 focus:ring-purple-tint disabled:cursor-not-allowed disabled:opacity-40 ${
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

          {step === "record" ? (
            <div className="pb-3">
              <section
                aria-label="Your public profile preview"
                className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm"
              >
                <div className="h-2 bg-emerald-brand" />
                <div className="p-5 sm:p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-ink">Intellectual Record</p>
                  <h2 className="mt-3 font-display text-2xl font-semibold text-ink">{fullName}</h2>
                  {currentPath === "student" ? (
                    <div className="mt-2 text-sm leading-6 text-ink-muted">
                      <p>Student at {university}</p>
                      <p>Studying {fieldOfStudy}</p>
                    </div>
                  ) : (
                    <div className="mt-2 text-sm leading-6 text-ink-muted">
                      <p>{professionalTitle}</p>
                      {organizationName ? <p>{organizationName}</p> : null}
                    </div>
                  )}
                  <p className="mt-4 text-sm leading-6 text-ink-soft">Interested in {formatInterests(interests)}</p>

                  {/* A brand new account has nothing in its record, and the
                      preview used to say so three times over in display type:
                      the last thing someone saw before entering the product
                      was 0, 0, 0 under their own name. Someone arriving with
                      published work still sees the numbers they have. */}
                  {previewMetrics.length > 0 ? (
                    <div
                      className={`mt-5 grid gap-px overflow-hidden rounded-xl border border-card-border bg-divider ${profileRecordMetricGridClass(previewMetrics.length)}`}
                    >
                      {previewMetrics.map((metric) => (
                        <div key={metric.key} className="bg-canvas px-2 py-4 text-center">
                          <p className="font-display text-xl font-semibold tabular-nums text-ink">
                            {metric.value.toLocaleString()}
                          </p>
                          <p className="mt-1 text-[11px] font-medium leading-4 text-ink-muted">
                            {metric.label}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-5 rounded-xl border border-dashed border-card-border bg-canvas px-4 py-4">
                      <p className="text-sm leading-6 text-ink-soft">
                        Publish your first contribution and this becomes a record:
                        what you published, which pieces carry sources, and which
                        have a citation others can point to.
                      </p>
                    </div>
                  )}
                </div>
              </section>
              <p className="mt-5 text-sm leading-6 text-ink-muted">
                Your profile grows as you publish ideas, respond to others, and contribute to public conversations.
              </p>
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

          {step === "record" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void finishOnboarding("write")}
                disabled={loading || isEnteringApp}
                aria-busy={loading || isEnteringApp || undefined}
                className="flex min-h-12 items-center justify-center rounded-xl bg-emerald-brand px-4 text-sm font-semibold text-white outline-none transition-opacity focus:ring-4 focus:ring-green-tint disabled:cursor-not-allowed disabled:opacity-50 sm:order-2"
              >
                {isEnteringApp ? "Opening…" : loading ? "Finishing setup…" : "Publish your first idea"}
              </button>
              <button
                type="button"
                onClick={() => void finishOnboarding("explore")}
                disabled={loading || isEnteringApp}
                className="flex min-h-12 items-center justify-center rounded-xl border border-card-border bg-card px-4 text-sm font-semibold text-ink outline-none transition-colors hover:bg-canvas focus:ring-4 focus:ring-green-tint disabled:cursor-not-allowed disabled:opacity-50 sm:order-1"
              >
                Explore ideas first
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void (step === "path" ? savePath() : step === "identity" ? saveIdentity() : saveTopics())}
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
