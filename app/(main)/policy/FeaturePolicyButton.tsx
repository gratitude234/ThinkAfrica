"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  postId: string;
}

export default function FeaturePolicyButton({ postId }: Props) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [institution, setInstitution] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("policy_briefs_featured").insert([
      {
        post_id: postId,
        featured_by: user.id,
        institution_target: institution || null,
      },
    ]);
    setLoading(false);
    setShowModal(false);
    setInstitution("");
    router.refresh();
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
      >
        Submit to Institutions
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-4">Feature for Institutions</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Institution Target
                </label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="e.g. Federal Ministry of Education"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Featuring..." : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
