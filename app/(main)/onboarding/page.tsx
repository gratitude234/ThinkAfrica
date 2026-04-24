"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import FollowButton from "@/components/ui/FollowButton";
import UserAvatar from "@/components/ui/UserAvatar";

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

interface SuggestedProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
  points: number | null;
}

type Step = "interests" | "follow";

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [graduationYear, setGraduationYear] = useState("");
  const [university, setUniversity] = useState<string | null>(null);
  const [fieldOfStudy, setFieldOfStudy] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedProfile[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<Step>("interests");

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
          .select("id, username, full_name, university, avatar_url, points")
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

      const metadata = user.user_metadata as {
        university?: string;
        field_of_study?: string;
        graduation_year?: string | number;
      };

      const { data: profile } = await supabase
        .from("profiles")
        .select(
          "interests, onboarding_completed, graduation_year, university, field_of_study"
        )
        .eq("id", user.id)
        .single();

      if (profile?.onboarding_completed) {
        router.push("/");
        return;
      }

      const nextUniversity = profile?.university || metadata.university || null;
      const nextFieldOfStudy =
        profile?.field_of_study || metadata.field_of_study || null;
      const nextGraduationYear =
        profile?.graduation_year ?? metadata.graduation_year ?? "";

      setInterests((profile?.interests as string[] | null) ?? []);
      setGraduationYear(nextGraduationYear ? String(nextGraduationYear) : "");
      setUniversity(nextUniversity);
      setFieldOfStudy(nextFieldOfStudy);
    });
  }, [router]);

  const toggleInterest = (tag: string) => {
    setInterests((prev) =>
      prev.includes(tag)
        ? prev.filter((item) => item !== tag)
        : prev.length >= 6
          ? prev
          : [...prev, tag]
    );
  };

  const saveInterestsAndContinue = async (skip = false) => {
    if (!userId) return;

    setLoading(true);
    const supabase = createClient();
    const payload: {
      interests?: string[];
      graduation_year?: number | null;
      university?: string;
      field_of_study?: string;
      onboarding_completed: boolean;
    } = {
      onboarding_completed: false,
    };

    if (!skip) {
      payload.interests = interests;
      payload.graduation_year = graduationYear
        ? parseInt(graduationYear, 10)
        : null;
    }

    if (university) payload.university = university;
    if (fieldOfStudy) payload.field_of_study = fieldOfStudy;

    await supabase.from("profiles").update(payload).eq("id", userId);
    await loadSuggestions(userId, university, fieldOfStudy);
    setStep("follow");
    setLoading(false);
  };

  const completeOnboarding = async (welcome: boolean) => {
    if (!userId) return;

    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", userId);
    setLoading(false);
    router.push(welcome ? "/?welcome=1" : "/");
  };

  if (step === "follow") {
    return (
      <div className="mx-auto max-w-4xl py-10">
        <div className="rounded-2xl border border-gray-200 bg-white p-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Follow some voices
              </h1>
              <p className="mt-2 text-sm text-gray-500">
                Start with a few writers from your field and the wider network.
              </p>
            </div>
            <Link
              href="/"
              onClick={(event) => {
                event.preventDefault();
                void completeOnboarding(false);
              }}
              className="text-sm text-gray-400 transition-colors hover:text-gray-600"
            >
              Skip for now {"->"}
            </Link>
          </div>

          {loadingSuggestions ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
              Finding suggested people...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
              No suggestions yet.
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
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-400">
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

          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={() => completeOnboarding(true)}
              disabled={loading || followedIds.size === 0}
              className="rounded-lg bg-emerald-brand px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Finishing..." : "Finish onboarding"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="rounded-2xl border border-gray-200 bg-white p-8">
        <h1 className="text-2xl font-bold text-gray-900">Interests</h1>
        <p className="mt-2 text-sm text-gray-500">
          Pick a few topics you care about. We&apos;ll use them to shape your feed
          from day one.
        </p>
        <p className="mt-4 text-xs text-gray-400">Choose up to 6 topics.</p>

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

        <div className="mt-6">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            When do you graduate?{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="number"
            min={2024}
            max={2040}
            placeholder="e.g. 2027"
            value={graduationYear}
            onChange={(e) => setGraduationYear(e.target.value)}
            className="w-full max-w-xs rounded-xl border border-gray-200 bg-canvas px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            We&apos;ll keep your account active and transition you to Alumni after you finish.
          </p>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => saveInterestsAndContinue(true)}
            className="text-sm text-gray-400 transition-colors hover:text-gray-600"
          >
            Skip interests
          </button>
          <button
            type="button"
            onClick={() => saveInterestsAndContinue(false)}
            disabled={loading}
            className="rounded-lg bg-emerald-brand px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
