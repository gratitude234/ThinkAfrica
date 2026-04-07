"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import UniversitySelect from "@/components/ui/UniversitySelect";

const INTEREST_OPTIONS = [
  "Law", "Economics", "Tech", "Health",
  "Politics", "Environment", "Education", "Culture",
];

const STEPS = ["Profile", "Interests", "Welcome"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [form, setForm] = useState({
    full_name: "",
    username: "",
    university: "",
    field_of_study: "",
    bio: "",
  });
  const [interests, setInterests] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<
    Array<{ id: string; username: string; full_name: string | null; university: string | null }>
  >([]);

  // Fetch people to follow when reaching step 3
  useEffect(() => {
    if (step !== 3 || !userId) return;
    const supabase = createClient();
    let q = supabase
      .from("profiles")
      .select("id, username, full_name, university")
      .neq("id", userId)
      .order("points", { ascending: false })
      .limit(3);
    q.then(({ data }) => {
      setSuggestions(data ?? []);
    });
  }, [step, userId]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);
      supabase
        .from("profiles")
        .select("full_name, username, university, field_of_study, bio, onboarding_completed")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.onboarding_completed) {
            router.push("/");
            return;
          }
          if (data) {
            setForm({
              full_name: data.full_name ?? "",
              username: data.username ?? "",
              university: data.university ?? "",
              field_of_study: data.field_of_study ?? "",
              bio: data.bio ?? "",
            });
          }
        });
    });
  }, [router]);

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({
        full_name: form.full_name,
        username: form.username,
        university: form.university,
        field_of_study: form.field_of_study,
        bio: form.bio,
      })
      .eq("id", userId);
    setLoading(false);
    setStep(2);
  };

  const handleStep2 = async (skip = false) => {
    if (!userId) return;
    setLoading(true);
    const supabase = createClient();
    if (!skip) {
      await supabase
        .from("profiles")
        .update({ interests })
        .eq("id", userId);
    }
    setLoading(false);
    setStep(3);
  };

  const handleFinish = async () => {
    if (!userId) return;
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", userId);
    router.push("/");
  };

  const toggleInterest = (tag: string) => {
    setInterests((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="max-w-xl mx-auto py-8">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {STEPS.map((label, i) => {
          const num = i + 1;
          const isDone = step > num;
          const isCurrent = step === num;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  isDone
                    ? "bg-emerald-brand text-white"
                    : isCurrent
                    ? "bg-emerald-brand text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {isDone ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  num
                )}
              </div>
              <span className={`text-sm ${isCurrent ? "text-gray-900 font-medium" : "text-gray-400"}`}>
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 ${step > num ? "bg-emerald-brand" : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Complete your profile</h1>
          <p className="text-gray-500 text-sm mb-5">Help the community know who you are.</p>
          <form onSubmit={handleStep1} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                <input
                  required
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username <span className="text-red-500">*</span></label>
                <input
                  required
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">University</label>
              <UniversitySelect
                value={form.university}
                onChange={(v) => setForm({ ...form, university: v })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Field of Study</label>
              <input
                type="text"
                value={form.field_of_study}
                onChange={(e) => setForm({ ...form, field_of_study: e.target.value })}
                placeholder="e.g. Political Science"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
              <textarea
                rows={3}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="Tell us about yourself..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent resize-none"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
              >
                {loading ? "Saving..." : "Next"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Choose your interests</h1>
          <p className="text-gray-500 text-sm mb-5">
            Select topics you care about. We&apos;ll personalize your experience.
          </p>
          <div className="grid grid-cols-4 gap-2 mb-6">
            {INTEREST_OPTIONS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleInterest(tag)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  interests.includes(tag)
                    ? "bg-emerald-brand text-white border-emerald-brand"
                    : "bg-white text-gray-600 border-gray-200 hover:border-emerald-brand hover:text-emerald-brand"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => handleStep2(true)}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => handleStep2(false)}
              disabled={loading}
              className="px-6 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              {loading ? "Saving..." : "Next"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🌍</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            You&apos;re ready to think with Africa!
          </h1>
          <p className="text-gray-500 mb-6">
            Welcome to ThinkAfrica. Explore ideas, join debates, and make your voice heard.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/"
              onClick={handleFinish}
              className="px-5 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
            >
              Explore Feed
            </a>
            <a
              href="/write"
              onClick={handleFinish}
              className="px-5 py-2 bg-white text-emerald-brand border border-emerald-brand text-sm font-medium rounded-lg hover:bg-emerald-50 transition-colors"
            >
              Write a Post
            </a>
            <a
              href="/debates"
              onClick={handleFinish}
              className="px-5 py-2 bg-white text-gray-600 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Join a Debate
            </a>
          </div>
          <button
            type="button"
            onClick={handleFinish}
            className="mt-4 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Skip for now
          </button>

          {/* People to follow */}
          {suggestions.length > 0 && (
            <div className="mt-6 text-left">
              <p className="text-sm font-semibold text-gray-900 mb-3">People to follow</p>
              <div className="space-y-2">
                {suggestions.map((person) => (
                  <div key={person.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold flex-shrink-0">
                      {person.full_name?.charAt(0)?.toUpperCase() ?? person.username?.charAt(0)?.toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {person.full_name ?? person.username}
                      </p>
                      {person.university && (
                        <p className="text-xs text-gray-400 truncate">{person.university}</p>
                      )}
                    </div>
                    <a
                      href={`/${person.username}`}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-brand text-white hover:bg-emerald-600 transition-colors flex-shrink-0"
                    >
                      View
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
