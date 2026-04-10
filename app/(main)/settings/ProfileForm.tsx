"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import AvatarUploader from "./AvatarUploader";

const COMMON_INTERESTS = [
  "economics", "governance", "public policy", "climate change", "technology",
  "health", "education", "agriculture", "fintech", "entrepreneurship",
  "politics", "history", "philosophy", "law", "human rights",
  "gender studies", "urbanization", "security", "trade", "diaspora",
];

interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  university: string | null;
  field_of_study: string | null;
  avatar_url: string | null;
  interests: string[] | null;
}

export default function ProfileForm({ profile }: { profile: Profile }) {
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [university, setUniversity] = useState(profile.university ?? "");
  const [fieldOfStudy, setFieldOfStudy] = useState(profile.field_of_study ?? "");
  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
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
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameError) return;

    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        username,
        bio,
        university,
        field_of_study: fieldOfStudy,
        interests,
        avatar_url: avatarUrl,
      })
      .eq("id", profile.id);

    setSaving(false);

    if (error) {
      setToast("Failed to save: " + error.message);
    } else {
      setToast("Profile saved successfully!");
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
      {toast && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            toast.startsWith("Failed")
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
          }`}
        >
          {toast}
        </div>
      )}

      {/* Avatar */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Profile photo
        </label>
        <AvatarUploader
          userId={profile.id}
          currentUrl={avatarUrl}
          fullName={fullName}
          onUpload={setAvatarUrl}
        />
      </div>

      {/* Full name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Full name
        </label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
        />
      </div>

      {/* Username */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Username
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
          onBlur={checkUsername}
          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent ${
            usernameError ? "border-red-400" : "border-gray-200"
          }`}
        />
        {usernameError && (
          <p className="text-xs text-red-500 mt-1">{usernameError}</p>
        )}
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Bio
        </label>
        <div className="relative">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={300}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent resize-none"
            placeholder="Tell the community about yourself…"
          />
          <span className="absolute bottom-2 right-2 text-xs text-gray-400">
            {bio.length}/300
          </span>
        </div>
      </div>

      {/* University */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          University
        </label>
        <input
          type="text"
          value={university}
          onChange={(e) => setUniversity(e.target.value)}
          placeholder="e.g. University of Lagos"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
        />
      </div>

      {/* Field of study */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Field of study
        </label>
        <input
          type="text"
          value={fieldOfStudy}
          onChange={(e) => setFieldOfStudy(e.target.value)}
          placeholder="e.g. Economics"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
        />
      </div>

      {/* Interests */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Interests
          <span className="ml-1 text-gray-400 font-normal text-xs">
            (select all that apply)
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          {COMMON_INTERESTS.map((interest) => (
            <button
              key={interest}
              type="button"
              onClick={() => toggleInterest(interest)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border capitalize ${
                interests.includes(interest)
                  ? "bg-emerald-brand text-white border-emerald-brand"
                  : "bg-white border-gray-200 text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
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
  );
}
