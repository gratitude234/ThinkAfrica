"use client";

import { useEffect, useRef, type RefObject } from "react";
import { createClient } from "@/lib/supabase/client";

const SESSION_KEY = (slug: string) => `ta_viewed_${slug}`;

export function useViewImpression(
  ref: RefObject<HTMLElement | null>,
  slug: string,
  authorId: string | undefined,
  currentUserId: string | null | undefined
) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!slug) return;

    // Skip author self-views
    if (authorId && currentUserId && currentUserId === authorId) return;

    // Skip if already counted this session
    if (sessionStorage.getItem(SESSION_KEY(slug))) return;

    const el = ref.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = setTimeout(() => {
            if (fired.current) return;
            if (sessionStorage.getItem(SESSION_KEY(slug))) return;
            fired.current = true;
            sessionStorage.setItem(SESSION_KEY(slug), "1");
            const supabase = createClient();
            supabase.rpc("increment_view_count", { post_slug: slug });
          }, 1000);
        } else {
          if (timer) clearTimeout(timer);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [slug, authorId, currentUserId, ref]);
}
