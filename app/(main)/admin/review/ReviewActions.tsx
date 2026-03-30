"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ReviewActionsProps {
  postId: string;
}

export default function ReviewActions({ postId }: ReviewActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);

  const handleApprove = async () => {
    setLoading("approve");
    const supabase = createClient();
    await supabase
      .from("posts")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", postId);
    setLoading(null);
    router.refresh();
  };

  const handleReject = async () => {
    setLoading("reject");
    const supabase = createClient();
    await supabase
      .from("posts")
      .update({ status: "rejected" })
      .eq("id", postId);
    setLoading(null);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleApprove}
        disabled={loading !== null}
        className="px-3 py-1.5 bg-emerald-brand text-white text-xs font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
      >
        {loading === "approve" ? "Publishing..." : "Approve"}
      </button>
      <button
        onClick={handleReject}
        disabled={loading !== null}
        className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-xs font-medium rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
      >
        {loading === "reject" ? "Rejecting..." : "Reject"}
      </button>
    </div>
  );
}
