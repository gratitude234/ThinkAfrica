"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("increment_view_count", { post_slug: slug });
  }, [slug]);

  return null;
}
