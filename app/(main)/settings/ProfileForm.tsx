"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { isUniversityEmail } from "@/lib/universityDomains";
import AvatarUploader from "./AvatarUploader";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
import UniversitySelect from "@/components/ui/UniversitySelect";
import { AFRICAN_COUNTRIES, inferCountryFromUniversity } from "@/lib/academicIdentity";
import {
  PROFILE_TYPE_OPTIONS,
  type ProfileType,
  isAcademicProfileType,
  isProfileType,
  normalizeSecondaryProfileTypes,
} from "@/lib/profileTypes";
import {
  getProfileUsernameError,
  normalizeProfileUsername,
} from "@/lib/profileUsername";

const COMMON_INTERESTS = [
  "economics",
  "governance",
  "public policy",
  "climate change",
  "technology",
  "health",
  "education",
  "agriculture",
  "fintech",
  "entrepreneurship",
  "politics",
  "history",
  "philosophy",
  "law",
  "human rights",
  "gender studies",
  "urbanization",
  "security",
  "trade",
  "diaspora",
];

interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  country: string | null;
  university: string | null;
  field_of_study: string | null;
  graduation_year: number | null;
  is_alumni?: boolean;
  open_to_mentoring?: boolean;
  verified?: boolean;
  verified_type?: string | null;
  signup_email?: string | null;
  avatar_url: string | null;
  interests: string[] | null;
  cover_image_url: string | null;
  profile_type: string | null;
  secondary_profile_types: string[] | null;
  organization_name: string | null;
  professional_title: string | null;
  organization_website: string | null;
}

const INPUT_STYLES =
  "w-full rounded-xl border border-gray-200 bg-canvas px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

export default function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? "");
  const initialProfileType = isProfileType(profile.profile_type)
    ? profile.profile_type
    : null;
  const [profileType, setProfileType] = useState<ProfileType | null>(
    initialProfileType
  );
  const [secondaryProfileTypes, setSecondaryProfileTypes] = useState<ProfileType[]>(
    normalizeSecondaryProfileTypes(profile.secondary_profile_types, initialProfileType)
  );
  const [country, setCountry] = useState(
    profile.country ?? inferCountryFromUniversity(profile.university)
  );
  const [university, setUniversity] = useState(profile.university ?? "");
  const [fieldOfStudy, setFieldOfStudy] = useState(profile.field_of_study ?? "");
  const [graduationYear, setGraduationYear] = useState<string>(
    profile.graduation_year ? String(profile.graduation_year) : ""
  );
  const [openToMentoring, setOpenToMentoring] = useState(
    (profile as typeof profile & { open_to_mentoring?: boolean })
      .open_to_mentoring ?? false
  );
  const [organizationName, setOrganizationName] = useState(
    profile.organization_name ?? ""
  );
  const [professionalTitle, setProfessionalTitle] = useState(
    profile.professional_title ?? ""
  );
  const [organizationWebsite, setOrganizationWebsite] = useState(
    profile.organization_website ?? ""
  );
  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [coverImageUrl, setCoverImageUrl] = useState(profile.cover_image_url);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const isAcademicProfile = isAcademicProfileType(profileType);
  const hasNonAcademicProfile = Boolean(profileType && !isAcademicProfile);

  const checkUsername = useCallback(async () => {
    const validationError = getProfileUsernameError(username);
    if (validationError) {
      setUsernameError(validationError);
      return;
    }

    if (username === profile.username) {
      setUsernameError(null);
      return;
    }

    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .neq("id", profile.id)
      .single();

    setUsernameError(data ? "Username already taken" : null);
  }, [username, profile.username, profile.id]);

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((item) => item !== interest)
        : [...prev, interest]
    );
  };

  const handleCountryChange = (nextCountry: string) => {
    if (nextCountry !== country) {
      setUniversity("");
    }
    setCountry(nextCountry);
  };

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

  // FIX: Auto-save avatar URL to DB immediately on upload
  const handleAvatarUpload = async (url: string) => {
    setAvatarUrl(url);

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", profile.id);

    if (error) {
      setToast("Failed to save profile photo.");
    }
  };

  // FIX: Auto-save cover URL to DB immediately on upload
  const handleCoverUpload = async (url: string) => {
    setCoverImageUrl(url);

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ cover_image_url: url })
      .eq("id", profile.id);

    if (error) {
      setToast("Failed to save cover photo.");
    }
  };

  // FIX: Auto-clear cover URL in DB on remove
  const handleCoverRemove = async () => {
    setCoverImageUrl(null);

    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ cover_image_url: null })
      .eq("id", profile.id);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameError) return;

    setSaving(true);
    const validationError = getProfileUsernameError(username);
    if (validationError) {
      setUsernameError(validationError);
      setSaving(false);
      return;
    }

    const parsedYear = graduationYear ? parseInt(graduationYear, 10) : null;
    if (parsedYear !== null && (parsedYear < 2015 || parsedYear > 2040)) {
      setToast("Please enter a valid graduation year between 2015 and 2040.");
      setSaving(false);
      return;
    }
    if (secondaryProfileTypes.length > 3) {
      setToast("Choose no more than 3 secondary profile types.");
      setSaving(false);
      return;
    }
    if (profileType && !isAcademicProfileType(profileType)) {
      if (!professionalTitle.trim()) {
        setToast("Add a title or short description for your profile.");
        setSaving(false);
        return;
      }
      if (profileType !== "other" && !organizationName.trim()) {
        setToast("Add your organization name.");
        setSaving(false);
        return;
      }
    }

    const supabase = createClient();
    const nextSecondaryProfileTypes = normalizeSecondaryProfileTypes(
      secondaryProfileTypes,
      profileType
    );

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        username,
        bio,
        profile_type: profileType,
        secondary_profile_types: nextSecondaryProfileTypes,
        country,
        university,
        field_of_study: fieldOfStudy,
        graduation_year: parsedYear,
        organization_name: organizationName.trim() || null,
        professional_title: professionalTitle.trim() || null,
        organization_website: organizationWebsite.trim() || null,
        open_to_mentoring: openToMentoring,
        interests,
        avatar_url: avatarUrl,
        cover_image_url: coverImageUrl,
      })
      .eq("id", profile.id);

    setSaving(false);

    if (error) {
      setToast(`Failed to save: ${error.message}`);
      return;
    }

    setSecondaryProfileTypes(nextSecondaryProfileTypes);
    setToast("Profile saved successfully!");
    if (username !== profile.username) {
      // Hard redirect forces the server layout to re-fetch the profile,
      // so the nav "Me" link immediately reflects the new username.
      window.location.href = `/${username}`;
    } else {
      router.refresh();
    }
  };

  return (
    <>
      <form onSubmit={handleSave} className="max-w-2xl space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Cover photo
          </label>
          <CoverImageUploader
            initialUrl={coverImageUrl ?? undefined}
            onUpload={handleCoverUpload}       // FIX: was setCoverImageUrl
            onRemove={handleCoverRemove}       // FIX: was () => setCoverImageUrl(null)
            bucket="avatars"
            buildPath={(userId) => `${userId}/cover.webp`}
            emptyTitle="Upload a cover image"
            emptyHint="This appears at the top of your profile."
            previewHeightClass="h-40"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Profile photo
          </label>
          <AvatarUploader
            userId={profile.id}
            currentUrl={avatarUrl}
            fullName={fullName}
            onUpload={handleAvatarUpload}      // FIX: was setAvatarUrl
          />
        </div>

        {profile.verified &&
        profile.verified_type === "student" &&
        profile.signup_email &&
        isUniversityEmail(profile.signup_email) ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-medium text-emerald-800">
              ✓ Verified via {profile.signup_email.split("@")[1]}
            </p>
            <p className="mt-0.5 text-xs text-emerald-600">
              Your university email automatically verified your account.
            </p>
          </div>
        ) : null}

        <div className="space-y-4 border-b border-gray-100 pb-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Profile type
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {PROFILE_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectPrimaryProfileType(option.value)}
                  className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                    profileType === option.value
                      ? "border-emerald-brand bg-emerald-50 text-emerald-950"
                      : "border-gray-200 bg-white text-gray-700 hover:border-emerald-300"
                  }`}
                >
                  <span className="text-sm font-semibold">{option.label}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-gray-500">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {profileType ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Secondary profile types{" "}
                <span className="text-xs font-normal text-gray-500">
                  ({secondaryProfileTypes.length}/3)
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
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
                          ? "border-emerald-brand bg-emerald-brand text-white"
                          : "border-gray-200 bg-white text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Full name
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={INPUT_STYLES}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) =>
              setUsername(normalizeProfileUsername(e.target.value))
            }
            onBlur={checkUsername}
            className={`${INPUT_STYLES} ${usernameError ? "border-red-400" : ""}`}
          />
          {usernameError ? (
            <p className="mt-1 text-xs text-red-500">{usernameError}</p>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Country
          </label>
          <select
            value={country}
            onChange={(e) => handleCountryChange(e.target.value)}
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
          <input
            type="text"
            value={fieldOfStudy}
            onChange={(e) => setFieldOfStudy(e.target.value)}
            placeholder="e.g. Computer Science, Law, Economics"
            className={INPUT_STYLES}
          />
        </div>

        {hasNonAcademicProfile ? (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Title or description
              </label>
              <input
                type="text"
                value={professionalTitle}
                onChange={(e) => setProfessionalTitle(e.target.value)}
                placeholder="e.g. Program manager, founder, policy analyst"
                className={INPUT_STYLES}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Organization{" "}
                {profileType === "other" || !profileType ? (
                  <span className="text-xs font-normal text-gray-400">(optional)</span>
                ) : null}
              </label>
              <input
                type="text"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="e.g. ThinkAfrica, ministry, newsroom, company"
                className={INPUT_STYLES}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Organization website{" "}
                <span className="text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="url"
                value={organizationWebsite}
                onChange={(e) => setOrganizationWebsite(e.target.value)}
                placeholder="https://example.org"
                className={INPUT_STYLES}
              />
            </div>
          </>
        ) : null}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Graduation year
          </label>
          <input
            id="graduation_year"
            type="number"
            min={2015}
            max={2040}
            placeholder="e.g. 2027"
            value={graduationYear}
            onChange={(e) => setGraduationYear(e.target.value)}
            className={INPUT_STYLES}
          />
          <p className="mt-1 text-xs text-gray-500">
            We&apos;ll keep your profile active after you graduate.
          </p>
        </div>

        {(profile.is_alumni || graduationYear) ? (
          <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Open to mentoring</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Students can find you in the alumni directory and reach out.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={openToMentoring}
              onClick={() => setOpenToMentoring((value) => !value)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                openToMentoring ? "bg-emerald-500" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  openToMentoring ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Bio
          </label>
          <div className="relative">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Tell the community about your work and research interests"
              className={`${INPUT_STYLES} resize-none`}
            />
            <span className="absolute bottom-2 right-2 text-xs text-gray-500">
              {bio.length}/300
            </span>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Topics you write about
            <span className="ml-1 text-xs font-normal text-gray-500">
              (select all that apply)
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            {COMMON_INTERESTS.map((interest) => (
              <button
                key={interest}
                type="button"
                onClick={() => toggleInterest(interest)}
                className={`rounded-full border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                  interests.includes(interest)
                    ? "border-emerald-brand bg-emerald-brand text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
                }`}
              >
                {interest}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" loading={saving} disabled={!!usernameError}>
            Save changes
          </Button>
        </div>
      </form>

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </>
  );
}
