"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  userId: string;
  verified: boolean;
  verifiedType: string | null;
}

export default function VerificationActions({ userId, verified, verifiedType }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState(verifiedType ?? "student");

  const update = async (newVerified: boolean) => {
    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ verified: newVerified, verified_type: newVerified ? type : null })
      .eq("id", userId);
    setLoading(false);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      {!verified && (
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-brand"
        >
          <option value="student">Student</option>
          <option value="researcher">Researcher</option>
          <option value="faculty">Faculty</option>
          <option value="institution">Institution</option>
        </select>
      )}
      {verified ? (
        <button
          onClick={() => update(false)}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border bg-red-50 text-red-600 border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          {loading ? "..." : "Revoke"}
        </button>
      ) : (
        <button
          onClick={() => update(true)}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
        >
          {loading ? "..." : "Verify"}
        </button>
      )}
    </div>
  );
}
