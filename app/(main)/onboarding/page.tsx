"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [graduationYear, setGraduationYear] = useState("");

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("interests, onboarding_completed, graduation_year")
        .eq("id", user.id)
        .single();

      if (profile?.onboarding_completed) {
        router.push("/");
        return;
      }

      setInterests((profile?.interests as string[] | null) ?? []);
      setGraduationYear(
        profile?.graduation_year ? String(profile.graduation_year) : ""
      );
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

  const handleContinue = async (skip = false) => {
    if (!userId) return;

    setLoading(true);
    const supabase = createClient();
    const payload: {
      interests?: string[];
      graduation_year?: number | null;
      onboarding_completed: boolean;
    } = {
      onboarding_completed: true,
    };

    if (!skip) {
      payload.interests = interests;
      payload.graduation_year = graduationYear
        ? parseInt(graduationYear, 10)
        : null;
    }

    await supabase.from("profiles").update(payload).eq("id", userId);
    setLoading(false);
    router.push("/?welcome=1");
  };

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
          <label className="block text-sm font-medium text-gray-700 mb-2">
            When do you graduate? <span className="text-gray-400 font-normal">(optional)</span>
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
            onClick={() => handleContinue(true)}
            className="text-sm text-gray-400 transition-colors hover:text-gray-600"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={() => handleContinue(false)}
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
