"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import FollowButton from "@/components/ui/FollowButton";
import UniversitySelect from "@/components/ui/UniversitySelect";
import UserAvatar from "@/components/ui/UserAvatar";
import AvatarUploader from "../settings/AvatarUploader";
import { trackActivationEvent } from "@/lib/activationEvents";
import { AFRICAN_COUNTRIES, inferCountryFromUniversity } from "@/lib/academicIdentity";
import {
  PROFILE_TYPE_OPTIONS,
  type ProfileType,
  isAcademicProfileType,
  isProfileType,
  normalizeSecondaryProfileTypes,
} from "@/lib/profileTypes";

const INTEREST_OPTIONS = [
  "Law & Justice",
  "Economics",
  "Technology",
  "Public Health",
  "Politics & Governance",
  "Environment & Climate",
  "Education Policy",
  "African Culture",
  "Philosophy",
  "Gender Studies",
  "Business & Finance",
  "International Relations",
  "Computer Science",
  "Medicine",
  "Agriculture",
  "Literature & Writing",
  "History",
  "Human Rights",
  "Social Justice",
  "Engineering",
];

const FIELD_OF_STUDY_OPTIONS = INTEREST_OPTIONS;

interface SuggestedProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  university: string | null;
  field_of_study?: string | null;
  avatar_url: string | null;
  points: number | null;
}

type Step = "persona" | "identity" | "interests" | "follow" | "contribute";

const STEP_ORDER: Step[] = ["persona", "identity", "interests", "follow", "contribute"];

const INPUT_STYLES =
  "w-full rounded-xl border border-gray-200 bg-canvas px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

function normalizeUsername(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function getStepFromParam(value: string | null): Step {
  return STEP_ORDER.includes(value as Step) ? (value as Step) : "identity";
}

function trackStepCompleted(step: Step) {
  trackActivationEvent({
    event: "onboarding_step_completed",
    metadata: { step },
  });
}

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStep = getStepFromParam(searchParams.get("step"));

  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [profileType, setProfileType] = useState<ProfileType | null>(null);
  const [secondaryProfileTypes, setSecondaryProfileTypes] = useState<ProfileType[]>([]);
  const [country, setCountry] = useState("");
  const [university, setUniversity] = useState("");
  const [fieldOfStudy, setFieldOfStudy] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [professionalTitle, setProfessionalTitle] = useState("");
  const [organizationWebsite, setOrganizationWebsite] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedProfile[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<Step>(initialStep);
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "available" | "taken"
  >("idle");

  const currentStepIndex = STEP_ORDER.indexOf(step);
  const progress = Math.round(((currentStepIndex + 1) / STEP_ORDER.length) * 100);
  const isAcademicProfile = isAcademicProfileType(profileType);
  const hasNonAcademicProfile = Boolean(profileType && !isAcademicProfile);
  const graduationYears = useMemo(
    () =>
      Array.from({ length: 20 }, (_, index) =>
        String(new Date().getFullYear() - 7 + index)
      ),
    []
  );

  const goToStep = useCallback(
    (nextStep: Step) => {
      setStep(nextStep);
      router.replace(`/onboarding?step=${nextStep}`);
    },
    [router]
  );

  const handleCountryChange = useCallback(
    (nextCountry: string) => {
      if (nextCountry !== country) {
        setUniversity("");
      }
      setCountry(nextCountry);
    },
    [country]
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

  useEffect(() => {
    const normalized = normalizeUsername(username);
    if (!normalized || normalized.length < 2 || !userId) {
      setUsernameStatus("idle");
      return;
    }
    setUsernameStatus("checking");
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", normalized)
        .neq("id", userId)
        .maybeSingle();
      setUsernameStatus(data ? "taken" : "available");
    }, 350);
    return () => clearTimeout(timer);
  }, [username, userId]);

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
      setFollowedIds(alreadyFollowing);

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

      const metadata = user.user_metadata as {
        full_name?: string;
        profile_type?: string;
        secondary_profile_types?: string[];
        country?: string;
        university?: string;
        field_of_study?: string;
        graduation_year?: string | number;
        organization_name?: string;
        professional_title?: string;
        organization_website?: string;
      };

      const { data: profile } = await supabase
        .from("profiles")
        .select(
          "full_name, username, avatar_url, interests, onboarding_completed, graduation_year, country, university, field_of_study, profile_type, secondary_profile_types, organization_name, professional_title, organization_website"
        )
        .eq("id", user.id)
        .single();

      if (profile?.onboarding_completed && initialStep === "persona") {
        router.push("/");
        return;
      }

      const nextFullName = profile?.full_name || metadata.full_name || "";
      const emailUsername = user.email?.split("@")[0] ?? "";
      const nextProfileType = isProfileType(profile?.profile_type)
        ? profile.profile_type
        : isProfileType(metadata.profile_type)
          ? metadata.profile_type
          : null;

      setFullName(nextFullName);
      setUsername(profile?.username || normalizeUsername(emailUsername));
      setAvatarUrl(profile?.avatar_url ?? null);
      setInterests((profile?.interests as string[] | null) ?? []);
      setProfileType(nextProfileType);
      setSecondaryProfileTypes(
        normalizeSecondaryProfileTypes(
          ((profile?.secondary_profile_types as string[] | null) ??
            metadata.secondary_profile_types) ??
            [],
          nextProfileType
        )
      );
      const nextUniversity = profile?.university || metadata.university || "";
      setCountry(
        profile?.country ||
          metadata.country ||
          inferCountryFromUniversity(nextUniversity)
      );
      setUniversity(nextUniversity);
      setFieldOfStudy(profile?.field_of_study || metadata.field_of_study || "");
      setOrganizationName(profile?.organization_name || metadata.organization_name || "");
      setProfessionalTitle(profile?.professional_title || metadata.professional_title || "");
      setOrganizationWebsite(profile?.organization_website || metadata.organization_website || "");
      setGraduationYear(
        profile?.graduation_year || metadata.graduation_year
          ? String(profile?.graduation_year ?? metadata.graduation_year)
          : ""
      );

      if (initialStep === "follow") {
        await loadSuggestions(
          user.id,
          profile?.university || metadata.university || null,
          profile?.field_of_study || metadata.field_of_study || null
        );
      }
    });
  }, [initialStep, loadSuggestions, router]);

  const savePersona = async () => {
    if (!userId) return;
    if (!profileType) {
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
        onboarding_completed: false,
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
    if (!userId) return;
    if (!profileType) {
      setError("Choose your profile type before finishing your identity.");
      goToStep("persona");
      return;
    }

    const needsAcademicDetails = isAcademicProfileType(profileType);
    const needsOrganization = !needsAcademicDetails && profileType !== "other";
    const needsProfessionalTitle = !needsAcademicDetails;

    if (!fullName.trim() || !username.trim() || !country.trim()) {
      setError("Add your name, username, and country.");
      return;
    }
    if (needsAcademicDetails && (!university.trim() || !fieldOfStudy)) {
      setError("Add your university and field of study.");
      return;
    }
    if (needsProfessionalTitle && !professionalTitle.trim()) {
      setError("Add a title or short description for your profile.");
      return;
    }
    if (needsOrganization && !organizationName.trim()) {
      setError("Add your organization name.");
      return;
    }
    if (usernameStatus === "taken") {
      setError("That username is already taken. Please choose another.");
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        username: normalizeUsername(username),
        country: country.trim(),
        university: university.trim() || null,
        field_of_study: fieldOfStudy || null,
        graduation_year: graduationYear ? parseInt(graduationYear, 10) : null,
        organization_name: organizationName.trim() || null,
        professional_title: professionalTitle.trim() || null,
        organization_website: organizationWebsite.trim() || null,
        avatar_url: avatarUrl,
        onboarding_completed: false,
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

  const toggleInterest = (tag: string) => {
    setInterests((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((item) => item !== tag);
      }
      if (prev.length >= 6) return prev;
      trackActivationEvent({ event: "interest_selected", metadata: { tag } });
      return [...prev, tag];
    });
  };

  const saveInterestsAndContinue = async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ interests, onboarding_completed: false })
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

  const completeOnboarding = async (destination = "/?welcome=1") => {
    if (!userId) return;

    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", userId);
    trackStepCompleted("contribute");
    trackActivationEvent({ event: "onboarding_completed" });
    setLoading(false);
    router.push(destination);
  };

  const handleAvatarUpload = async (url: string) => {
    setAvatarUrl(url);
    if (!userId) return;

    const supabase = createClient();
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
  };

  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between text-xs font-medium text-gray-500">
          <span>Step {currentStepIndex + 1} of {STEP_ORDER.length}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Onboarding progress"
            className="h-full rounded-full bg-emerald-500 transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {step === "persona" ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Profile type
          </p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            What best describes you?
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Choose one primary identity. You can add up to 3 secondary identities
            if your work crosses roles.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PROFILE_TYPE_OPTIONS.map((option) => {
              const selected = profileType === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectPrimaryProfileType(option.value)}
                  className={`min-h-[132px] rounded-xl border p-4 text-left transition-colors ${
                    selected
                      ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100"
                      : "border-gray-200 bg-white hover:border-emerald-200"
                  }`}
                >
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      selected
                        ? "bg-emerald-600 text-white"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {selected ? "Primary" : "Choose"}
                  </span>
                  <p className="mt-3 text-sm font-semibold text-gray-900">
                    {option.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>

          {profileType ? (
            <div className="mt-6 rounded-xl border border-gray-200 bg-canvas p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Secondary identities
                  </p>
                  <p className="text-xs text-gray-500">
                    Optional. {secondaryProfileTypes.length}/3 selected.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {PROFILE_TYPE_OPTIONS.filter((option) => option.value !== profileType).map(
                  (option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleSecondaryProfileType(option.value)}
                      disabled={
                        !secondaryProfileTypes.includes(option.value) &&
                        secondaryProfileTypes.length >= 3
                      }
                      className={`rounded-full border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        secondaryProfileTypes.includes(option.value)
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:border-emerald-300"
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                )}
              </div>
            </div>
          ) : null}

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={savePersona}
              disabled={loading || !profileType}
              className="rounded-lg bg-emerald-brand px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Continue"}
            </button>
          </div>
        </section>
      ) : null}

      {step === "identity" ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            {hasNonAcademicProfile ? "Professional identity" : "Academic identity"}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            Set up the profile people will trust
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            These details help readers, editors, and collaborators understand your work.
          </p>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              {userId ? (
                <AvatarUploader
                  userId={userId}
                  currentUrl={avatarUrl}
                  fullName={fullName}
                  onUpload={handleAvatarUpload}
                />
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Full name
              </label>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className={INPUT_STYLES}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Username
              </label>
              <input
                value={username}
                onChange={(event) => setUsername(normalizeUsername(event.target.value))}
                className={INPUT_STYLES}
              />
              {usernameStatus === "available" ? (
                <p className="mt-1 text-xs text-emerald-600">✓ Available</p>
              ) : usernameStatus === "taken" ? (
                <p className="mt-1 text-xs text-red-500">✗ Already taken — try a variation.</p>
              ) : usernameStatus === "checking" ? (
                <p className="mt-1 text-xs text-gray-400">Checking…</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Country
              </label>
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
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                University{" "}
                {hasNonAcademicProfile ? (
                  <span className="text-xs font-normal text-gray-400">(optional)</span>
                ) : null}
              </label>
              <UniversitySelect
                value={university}
                onChange={setUniversity}
                country={country}
                disabled={!country}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Field of study{" "}
                {hasNonAcademicProfile ? (
                  <span className="text-xs font-normal text-gray-400">(optional)</span>
                ) : null}
              </label>
              <select
                value={fieldOfStudy}
                onChange={(event) => setFieldOfStudy(event.target.value)}
                className={INPUT_STYLES}
              >
                <option value="">Select field of study</option>
                {FIELD_OF_STUDY_OPTIONS.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </div>
            {hasNonAcademicProfile ? (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Title or description
                  </label>
                  <input
                    value={professionalTitle}
                    onChange={(event) => setProfessionalTitle(event.target.value)}
                    placeholder="e.g. Program manager, founder, policy analyst"
                    className={INPUT_STYLES}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Organization{" "}
                    {profileType === "other" ? (
                      <span className="text-xs font-normal text-gray-400">(optional)</span>
                    ) : null}
                  </label>
                  <input
                    value={organizationName}
                    onChange={(event) => setOrganizationName(event.target.value)}
                    placeholder="e.g. ThinkAfrica, ministry, newsroom, company"
                    className={INPUT_STYLES}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Organization website{" "}
                    <span className="text-xs font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={organizationWebsite}
                    onChange={(event) => setOrganizationWebsite(event.target.value)}
                    placeholder="https://example.org"
                    className={INPUT_STYLES}
                  />
                </div>
              </>
            ) : null}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Graduation year{" "}
                <span className="text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <select
                value={graduationYear}
                onChange={(event) => setGraduationYear(event.target.value)}
                className={INPUT_STYLES}
              >
                <option value="">Select graduation year</option>
                {graduationYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={() => goToStep("persona")}
              className="mr-auto text-sm text-gray-500 hover:text-gray-700"
            >
              Back
            </button>
            <button
              type="button"
              onClick={saveIdentity}
              disabled={loading}
              className="rounded-lg bg-emerald-brand px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Continue"}
            </button>
          </div>
        </section>
      ) : null}

      {step === "interests" ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Interests
          </p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            Choose the ideas you want in your feed
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Pick up to 6 topics. We will use them for recommendations and first follows.{" "}
            <span className={`font-semibold ${interests.length >= 6 ? "text-amber-600" : "text-emerald-700"}`}>
              {interests.length}/6 selected
            </span>
            {interests.length >= 6 ? " — deselect one to change." : ""}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
            {INTEREST_OPTIONS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleInterest(tag)}
                className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                  interests.includes(tag)
                    ? "bg-emerald-600 text-white ring-2 ring-emerald-300"
                    : "border border-gray-200 bg-canvas text-gray-700 hover:border-emerald-300"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              onClick={() => goToStep("identity")}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Back
            </button>
            <button
              type="button"
              onClick={saveInterestsAndContinue}
              disabled={loading || interests.length === 0}
              className="rounded-lg bg-emerald-brand px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Continue"}
            </button>
          </div>
        </section>
      ) : null}

      {step === "follow" ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                First network
              </p>
              <h1 className="mt-2 text-2xl font-bold text-gray-900">
                Follow 3 writers to shape your home feed
              </h1>
              <p className="mt-2 text-sm font-medium text-gray-700">
                <span className={followedIds.size >= 3 ? "text-emerald-600" : "text-gray-700"}>
                  {Math.min(followedIds.size, 3)}/3
                </span>{" "}
                <span className="text-gray-500">writers followed</span>
              </p>
            </div>
          </div>

          {loadingSuggestions ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
              Finding suggested people...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
              No suggestions yet. You can still continue and explore the latest posts.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((profile) => (
                <div
                  key={profile.id}
                  className="rounded-xl border border-gray-200 bg-white p-4"
                >
                  <div className="mb-4 flex items-start gap-3">
                    <UserAvatar
                      name={profile.full_name ?? profile.username ?? "Anonymous"}
                      src={profile.avatar_url}
                      size={44}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {profile.full_name ?? profile.username ?? "Anonymous"}
                      </p>
                      {profile.university ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                          {profile.university}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        {(profile.points ?? 0).toLocaleString()} points
                      </p>
                    </div>
                  </div>

                  {userId ? (
                    <FollowButton
                      followerId={userId}
                      followingId={profile.id}
                      onChange={(following) => {
                        setFollowedIds((current) => {
                          const next = new Set(current);
                          if (following) {
                            next.add(profile.id);
                          } else {
                            next.delete(profile.id);
                          }
                          return next;
                        });
                      }}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              onClick={() => goToStep("interests")}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Back
            </button>
            <div className="flex items-center gap-3">
              {followedIds.size < 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    trackStepCompleted("follow");
                    goToStep("contribute");
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Skip for now
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  trackStepCompleted("follow");
                  goToStep("contribute");
                }}
                disabled={followedIds.size < 3}
                className="rounded-lg bg-emerald-brand px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
              >
                {followedIds.size < 3
                  ? `Continue (${Math.min(followedIds.size, 3)}/3)`
                  : "Continue"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {step === "contribute" ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            First contribution
          </p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            Start with one clear idea
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            A quick take is the fastest way to make your profile real. You can
            publish today or keep it as a draft while you read more.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
            <button
              type="button"
              onClick={() => completeOnboarding("/write?type=blog&starter=1&welcome=1")}
              className="rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-left shadow-sm transition-colors hover:bg-emerald-100"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Recommended
              </p>
              <p className="mt-2 text-base font-semibold text-emerald-950">
                Write a quick take
              </p>
              <p className="mt-2 text-sm leading-relaxed text-emerald-900">
                Use a short structure: your point, why it matters, one example,
                and the question others should answer.
              </p>
            </button>
            <button
              type="button"
              onClick={() => completeOnboarding("/?tab=latest&welcome=1")}
              className="rounded-xl border border-gray-200 bg-white p-5 text-left transition-colors hover:border-emerald-200"
            >
              <p className="text-sm font-semibold text-gray-900">
                Read latest posts
              </p>
              <p className="mt-2 text-xs leading-relaxed text-gray-500">
                Browse first if you want more context before writing.
              </p>
            </button>
            <button
              type="button"
              onClick={() => completeOnboarding("/?tab=latest&type=essay&welcome=1")}
              className="rounded-xl border border-gray-200 bg-white p-5 text-left transition-colors hover:border-emerald-200"
            >
              <p className="text-sm font-semibold text-gray-900">
                Respond to a post
              </p>
              <p className="mt-2 text-xs leading-relaxed text-gray-500">
                Open an essay and add a response when you have a useful angle.
              </p>
            </button>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              onClick={() => goToStep("follow")}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => completeOnboarding()}
              disabled={loading}
              className="rounded-lg border border-gray-200 px-6 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-canvas disabled:opacity-50"
            >
              {loading ? "Finishing..." : "Finish for now"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
