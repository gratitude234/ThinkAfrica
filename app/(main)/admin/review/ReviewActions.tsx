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
    await supabase.from("posts").update({ status: "rejected" }).eq("id", postId);
    setLoading(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleApprove}
        disabled={!!loading}
        className="rounded-lg bg-emerald-brand px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
      >
        {loading === "approve" ? "Publishing..." : "✓ Approve"}
      </button>
      <button
        onClick={handleReject}
        disabled={!!loading}
        className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
      >
        {loading === "reject" ? "Rejecting..." : "✕ Reject"}
      </button>
    </div>
  );
}
