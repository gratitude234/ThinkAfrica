"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AmbassadorApplyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [university, setUniversity] = useState("");
  const [why, setWhy] = useState("");
  const [howRecruit, setHowRecruit] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login?redirectTo=/ambassadors/apply");
        return;
      }
      supabase
        .from("profiles")
        .select("university")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.university) setUniversity(data.university);
        });
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login?redirectTo=/ambassadors/apply");
      return;
    }

    const { error: insertError } = await supabase
      .from("campus_ambassadors")
      .insert([{ user_id: user.id, university, status: "pending" }]);

    if (insertError) {
      setError(
        insertError.code === "23505"
          ? "You have already applied."
          : insertError.message
      );
      setLoading(false);
      return;
    }

    setSubmitted(true);
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Application Submitted!</h1>
        <p className="text-gray-500 mb-6">
          Thank you for applying to become a ThinkAfrica Campus Ambassador. We&apos;ll review your application and get back to you soon.
        </p>
        <a
          href="/ambassadors"
          className="inline-flex items-center px-5 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
        >
          Back to Ambassadors
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Ambassador Application</h1>
        <p className="text-gray-500 text-sm mt-1">
          Tell us why you&apos;d be a great ThinkAfrica ambassador at your campus.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            University <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={university}
            onChange={(e) => setUniversity(e.target.value)}
            placeholder="e.g. University of Lagos"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Why do you want to be an ambassador? <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={4}
            required
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="Share your motivation and connection to the ThinkAfrica mission..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            How will you recruit contributors? <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={4}
            required
            value={howRecruit}
            onChange={(e) => setHowRecruit(e.target.value)}
            placeholder="Describe your plan to grow the ThinkAfrica community at your campus..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent resize-none"
          />
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            {loading ? "Submitting..." : "Submit Application"}
          </button>
        </div>
      </form>
    </div>
  );
}
