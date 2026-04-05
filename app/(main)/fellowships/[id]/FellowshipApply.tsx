"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  fellowshipId: string;
  userId: string | null;
  existingApplication: { status: string } | null;
  fellowshipStatus: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  shortlisted: "bg-blue-50 text-blue-700 border-blue-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-600 border-red-200",
};

export default function FellowshipApply({
  fellowshipId,
  userId,
  existingApplication,
  fellowshipStatus,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wordCount = coverLetter.trim().split(/\s+/).filter(Boolean).length;

  if (existingApplication) {
    const status = existingApplication.status;
    return (
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border ${STATUS_STYLES[status] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
        Application: {status.charAt(0).toUpperCase() + status.slice(1)}
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-700">
        Application submitted successfully!
      </div>
    );
  }

  if (fellowshipStatus === "closed") {
    return (
      <span className="text-sm text-gray-400">This fellowship is now closed.</span>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      router.push(`/login?redirectTo=/fellowships/${fellowshipId}`);
      return;
    }
    if (wordCount < 200) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("fellowship_applications").insert([
      { fellowship_id: fellowshipId, user_id: userId, cover_letter: coverLetter },
    ]);
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setLoading(false);
    setSubmitted(true);
    setOpen(false);
  };

  return (
    <div>
      {!open ? (
        <button
          onClick={() => {
            if (!userId) router.push(`/login?redirectTo=/fellowships/${fellowshipId}`);
            else setOpen(true);
          }}
          className="px-5 py-2.5 bg-emerald-brand text-white font-medium rounded-lg hover:bg-emerald-600 transition-colors text-sm"
        >
          Apply for this Fellowship
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cover Letter{" "}
              <span className={`text-xs ${wordCount < 200 ? "text-red-500" : "text-emerald-600"}`}>
                ({wordCount} / 200 words min)
              </span>
            </label>
            <textarea
              rows={10}
              required
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              placeholder="Tell us about yourself, your work, and why you'd be a great recipient for this fellowship..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent resize-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading || wordCount < 200}
              className="px-5 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              {loading ? "Submitting..." : "Submit Application"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
