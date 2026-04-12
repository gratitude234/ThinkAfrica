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
      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-8">
        <div
          className="bg-emerald-brand h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 text-right mb-6">
        Step {step} of {STEPS.length}
      </p>

      {/* Step 1 */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            Let&apos;s set up your profile
          </h1>
          <p className="text-sm text-gray-400 mb-6">
            Just the basics - you can add more later in Settings.
          </p>
          <form onSubmit={handleStep1} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your name <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                value={form.username}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-400">
                This becomes your public @handle and must be unique.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your university
              </label>
              <UniversitySelect
                value={form.university}
                onChange={(v) => setForm({ ...form, university: v })}
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
