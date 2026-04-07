"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  postId: string;
  initialFeatured: boolean;
}

export default function FeaturePostButton({ postId, initialFeatured }: Props) {
  const [featured, setFeatured] = useState(initialFeatured);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    const supabase = createClient();

    if (!featured) {
      // Unfeature any currently featured posts, then feature this one
      await supabase.from("posts").update({ featured: false }).eq("featured", true);
      await supabase.from("posts").update({ featured: true }).eq("id", postId);
    } else {
      await supabase.from("posts").update({ featured: false }).eq("id", postId);
    }

    setFeatured(!featured);
    setLoading(false);
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      aria-label={featured ? "Remove featured status" : "Set as featured post"}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
        featured
          ? "bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200"
          : "bg-white border-gray-200 text-gray-600 hover:border-amber-300 hover:text-amber-700"
      }`}
    >
      {loading ? "..." : featured ? "⭐ Featured" : "Feature post"}
    </button>
  );
}
