"use client";

import { useEffect, useRef, type RefObject } from "react";

const SESSION_KEY = (slug: string, surface: string) =>
  `ta_impression_${surface}_${slug}`;

export function useViewImpression(
  ref: RefObject<HTMLElement | null>,
  slug: string,
  surface: string
) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!slug) return;

    const sessionKey = SESSION_KEY(slug, surface);
    if (sessionStorage.getItem(sessionKey)) return;

    const el = ref.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = setTimeout(() => {
            if (fired.current) return;
            if (sessionStorage.getItem(sessionKey)) return;
            fired.current = true;
            sessionStorage.setItem(sessionKey, "1");
            void fetch(`/api/posts/${encodeURIComponent(slug)}/impression`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                surface,
                route: `${window.location.pathname}${window.location.search}`,
              }),
              keepalive: true,
            });
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
  }, [slug, surface, ref]);
}
