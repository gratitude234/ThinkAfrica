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
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      if (!featured) {
        // Unfeature any currently featured posts, then feature this one
        const { error: unfeatureError } = await supabase
          .from("posts")
          .update({ featured: false })
          .eq("featured", true);

        if (unfeatureError) {
          throw unfeatureError;
        }

        const { error: featureError } = await supabase
          .from("posts")
          .update({ featured: true })
          .eq("id", postId);

        if (featureError) {
          throw featureError;
        }
      } else {
        const { error: clearError } = await supabase
          .from("posts")
          .update({ featured: false })
          .eq("id", postId);

        if (clearError) {
          throw clearError;
        }
      }

      setFeatured(!featured);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update featured post.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleToggle}
        disabled={loading}
        aria-label={featured ? "Remove featured status" : "Set as featured post"}
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          featured
            ? "border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200"
            : "border-gray-200 bg-white text-gray-600 hover:border-amber-300 hover:text-amber-700"
        }`}
      >
        {loading ? "..." : featured ? "Featured" : "Feature post"}
      </button>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
