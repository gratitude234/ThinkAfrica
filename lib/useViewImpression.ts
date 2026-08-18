"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { FeedExposure } from "@/lib/feedExposure";

const SESSION_KEY = (slug: string, surface: string) =>
  `ta_v2_impression_${surface}_${slug}`;
const EXPOSURE_KEY = (slug: string) => `ta_v2_feed_exposure_${slug}`;
const MAX_STORED_EXPOSURE_AGE_MS = 48 * 60 * 60 * 1000;

export type StoredFeedExposure = Record<string, string | number>;

function exposureMetadata(exposure: FeedExposure): StoredFeedExposure {
  return {
    exposureId: exposure.exposureId,
    postId: exposure.postId,
    slug: exposure.slug,
    feedSessionId: exposure.feedSessionId,
    requestId: exposure.requestId,
    algorithmVersion: exposure.algorithmVersion,
    experimentVariant: exposure.experimentVariant,
    candidateSource: exposure.candidateSource,
    position: exposure.position,
    page: exposure.page,
    servedAt: exposure.servedAt,
    surface: exposure.surface,
    ...(exposure.signature ? { signature: exposure.signature } : {}),
  };
}

export function readStoredFeedExposure(slug: string): StoredFeedExposure | null {
  try {
    const value = sessionStorage.getItem(EXPOSURE_KEY(slug));
    if (!value) return null;
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const stored = parsed as StoredFeedExposure;
    const servedAt =
      typeof stored.servedAt === "string" ? Date.parse(stored.servedAt) : NaN;
    if (
      !Number.isFinite(servedAt) ||
      Date.now() - servedAt > MAX_STORED_EXPOSURE_AGE_MS
    ) {
      sessionStorage.removeItem(EXPOSURE_KEY(slug));
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

export function consumeStoredFeedExposure(
  slug: string
): StoredFeedExposure | null {
  const exposure = readStoredFeedExposure(slug);
  try {
    sessionStorage.removeItem(EXPOSURE_KEY(slug));
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
  return exposure;
}

export function useViewImpression(
  ref: RefObject<HTMLElement | null>,
  slug: string,
  surface: string,
  exposure?: FeedExposure | null
) {
  const fired = useRef(false);
  const exposureRef = useRef(exposure);
  const exposureId = exposure?.exposureId ?? null;

  useEffect(() => {
    exposureRef.current = exposure;
  }, [exposure]);

  useEffect(() => {
    // A keyed card can move between feed surfaces without remounting. Reset
    // the local latch when slug/surface changes; daily database dedupe remains
    // the final authority for repeated impressions.
    fired.current = false;
    if (!slug) return;
    // Ranking impressions are accepted only for server-signed feed
    // placements. Other surfaces should not emit requests the API will reject
    // or let unsigned exposure affect the ranking denominator.
    if (!exposureId) return;

    const sessionKey = SESSION_KEY(slug, surface);
    if (sessionStorage.getItem(sessionKey)) return;

    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = setTimeout(() => {
            if (fired.current) return;
            if (sessionStorage.getItem(sessionKey)) return;
            fired.current = true;
            sessionStorage.setItem(sessionKey, "1");
            const currentExposure = exposureRef.current;
            const metadata = currentExposure
              ? exposureMetadata(currentExposure)
              : null;
            if (metadata) {
              sessionStorage.setItem(EXPOSURE_KEY(slug), JSON.stringify(metadata));
            }
            void fetch(`/api/posts/${encodeURIComponent(slug)}/impression`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                surface,
                route: `${window.location.pathname}${window.location.search}`,
                metadata,
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
  }, [slug, surface, ref, exposureId]);
}
