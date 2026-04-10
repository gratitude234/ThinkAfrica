"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ReviewActionsProps {
  postId: string;
}

export default function ReviewActions({ postId }: ReviewActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleUnpublish = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase
      .from("posts")
      .update({ status: "rejected" })
      .eq("id", postId);
    setLoading(false);
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleUnpublish}
        disabled={loading}
        className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-xs font-medium rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
      >
        {loading ? "Unpublishing..." : "Unpublish"}
      </button>
    </div>
  );
}
