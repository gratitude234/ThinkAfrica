"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import AvatarUploader from "./AvatarUploader";
import CoverImageUploader from "@/components/ui/CoverImageUploader";

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
  university: string | null;
  field_of_study: string | null;
  graduation_year: number | null;
  is_alumni?: boolean;
  open_to_mentoring?: boolean;
  avatar_url: string | null;
  interests: string[] | null;
  cover_image_url: string | null;
}

const INPUT_STYLES =
  "w-full rounded-xl border border-gray-200 bg-canvas px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

export default function ProfileForm({ profile }: { profile: Profile }) {
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [university, setUniversity] = useState(profile.university ?? "");
  const [fieldOfStudy, setFieldOfStudy] = useState(profile.field_of_study ?? "");
  const [graduationYear, setGraduationYear] = useState<string>(
    profile.graduation_year ? String(profile.graduation_year) : ""
  );
  const [openToMentoring, setOpenToMentoring] = useState(
    (profile as typeof profile & { open_to_mentoring?: boolean })
      .open_to_mentoring ?? false
  );
  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [coverImageUrl, setCoverImageUrl] = useState(profile.cover_image_url);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const checkUsername = useCallback(async () => {
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
    const parsedYear = graduationYear ? parseInt(graduationYear, 10) : null;
    if (parsedYear !== null && (parsedYear < 2015 || parsedYear > 2040)) {
      setToast("Please enter a valid graduation year between 2015 and 2040.");
      setSaving(false);
      return;
    }

    const supabase = createClient();

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        username,
        bio,
        university,
        field_of_study: fieldOfStudy,
        graduation_year: parsedYear,
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

    setToast("Profile saved successfully!");
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
              setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))
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
            University
          </label>
          <input
            type="text"
            value={university}
            onChange={(e) => setUniversity(e.target.value)}
            placeholder="e.g. University of Lagos"
            className={INPUT_STYLES}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Field of study
          </label>
          <input
            type="text"
            value={fieldOfStudy}
            onChange={(e) => setFieldOfStudy(e.target.value)}
            placeholder="e.g. Computer Science, Law, Economics"
            className={INPUT_STYLES}
          />
        </div>

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
          <p className="mt-1 text-xs text-gray-400">
            We&apos;ll keep your profile active after you graduate.
          </p>
        </div>

        {(profile.is_alumni || graduationYear) ? (
          <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Open to mentoring</p>
              <p className="mt-0.5 text-xs text-gray-400">
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
            <span className="absolute bottom-2 right-2 text-xs text-gray-400">
              {bio.length}/300
            </span>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Topics you write about
            <span className="ml-1 text-xs font-normal text-gray-400">
              (select all that apply)
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            {COMMON_INTERESTS.map((interest) => (
              <button
                key={interest}
                type="button"
                onClick={() => toggleInterest(interest)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
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
