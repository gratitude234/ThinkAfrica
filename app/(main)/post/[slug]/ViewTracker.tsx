"use client";

import { useEffect, useRef } from "react";
import { trackActivationEvent } from "@/lib/activationEvents";

const VIEW_SESSION_KEY = (slug: string) => `ta_post_view_${slug}`;
const READ_SESSION_KEY = (slug: string) => `ta_post_read_${slug}`;

function getScrollDepth() {
  const documentElement = document.documentElement;
  const scrollable = documentElement.scrollHeight - window.innerHeight;
  if (scrollable <= 0) return 100;
  return Math.max(
    0,
    Math.min(100, Math.round((window.scrollY / scrollable) * 100))
  );
}

function postEngagement(
  slug: string,
  eventType: "view" | "read",
  payload: Record<string, string | number | null> = {}
) {
  return fetch(`/api/posts/${encodeURIComponent(slug)}/${eventType}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      route: `${window.location.pathname}${window.location.search}`,
      ...payload,
    }),
    keepalive: true,
  });
}

export default function ViewTracker({
  slug,
  wordCount,
}: {
  slug: string;
  wordCount: number;
}) {
  const activeSecondsRef = useRef(0);
  const maxScrollDepthRef = useRef(0);
  const readFiredRef = useRef(false);

  useEffect(() => {
    if (!sessionStorage.getItem(VIEW_SESSION_KEY(slug))) {
      sessionStorage.setItem(VIEW_SESSION_KEY(slug), "1");
      void postEngagement(slug, "view");
    }

    trackActivationEvent({ event: "post_opened", metadata: { slug } });
  }, [slug]);

  useEffect(() => {
    if (sessionStorage.getItem(READ_SESSION_KEY(slug))) return;

    const requiredSeconds = wordCount <= 600 ? 15 : 30;
    const requiredDepth = wordCount <= 600 ? 50 : 60;

    const maybeRecordRead = () => {
      if (readFiredRef.current) return;
      maxScrollDepthRef.current = Math.max(maxScrollDepthRef.current, getScrollDepth());
      if (
        activeSecondsRef.current < requiredSeconds ||
        maxScrollDepthRef.current < requiredDepth
      ) {
        return;
      }

      readFiredRef.current = true;
      sessionStorage.setItem(READ_SESSION_KEY(slug), "1");
      void postEngagement(slug, "read", {
        readSeconds: activeSecondsRef.current,
        scrollDepth: maxScrollDepthRef.current,
      });
    };

    const onScroll = () => {
      maxScrollDepthRef.current = Math.max(maxScrollDepthRef.current, getScrollDepth());
      maybeRecordRead();
    };

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        activeSecondsRef.current += 1;
        maybeRecordRead();
      }
    }, 1000);

    maxScrollDepthRef.current = getScrollDepth();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    maybeRecordRead();

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [slug, wordCount]);

  return null;
}
