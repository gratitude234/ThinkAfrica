"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { trackActivationEvent } from "@/lib/activationEvents";

export default function ViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("increment_view_count", { post_slug: slug });
    trackActivationEvent({
      event: "post_opened",
      metadata: { slug },
    });
  }, [slug]);

  return null;
}
