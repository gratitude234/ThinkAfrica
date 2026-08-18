"use client";

import { useEffect, useRef } from "react";
import { useOptionalAuthorRelationship } from "@/components/profile/AuthorRelationshipProvider";
import { trackActivationEvent } from "@/lib/activationEvents";
import { qualifiedReadThresholds } from "@/lib/publicationDelivery";
import {
  consumeStoredFeedExposure,
  type StoredFeedExposure,
} from "@/lib/useViewImpression";

const VIEW_SESSION_KEY = (slug: string) => `ta_post_view_${slug}`;
const READ_SESSION_KEY = (slug: string) => `ta_post_read_${slug}`;

function getDeliveryToken() {
  const token = new URLSearchParams(window.location.search).get("delivery");
  return token && /^[0-9a-f-]{36}$/i.test(token) ? token : null;
}

function sessionKey(base: (slug: string) => string, slug: string) {
  const token = getDeliveryToken();
  return token ? `${base(slug)}_${token}` : base(slug);
}

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
  engagementToken: string | null,
  payload: Record<string, string | number | null> = {},
  metadata: StoredFeedExposure | null = null
) {
  return fetch(`/api/posts/${encodeURIComponent(slug)}/${eventType}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      route: `${window.location.pathname}${window.location.search}`,
      engagementToken,
      deliveryToken: getDeliveryToken(),
      metadata,
      ...payload,
    }),
    keepalive: true,
  });
}

export default function ViewTracker({
  slug,
  wordCount,
  engagementToken,
}: {
  slug: string;
  wordCount: number;
  engagementToken: string | null;
}) {
  const relationship = useOptionalAuthorRelationship();
  const activeSecondsRef = useRef(0);
  const maxScrollDepthRef = useRef(0);
  const readFiredRef = useRef(false);
  const exposureRef = useRef<StoredFeedExposure | null>(null);

  useEffect(() => {
    const exposure = consumeStoredFeedExposure(slug);
    exposureRef.current = exposure;
    const viewSessionKey = sessionKey(VIEW_SESSION_KEY, slug);
    if (!sessionStorage.getItem(viewSessionKey)) {
      sessionStorage.setItem(viewSessionKey, "1");
      void postEngagement(slug, "view", engagementToken, {}, exposure);
    }

    trackActivationEvent({
      event: "post_opened",
      metadata: {
        slug,
        ...(exposure?.exposureId
          ? {
              exposureId: exposure.exposureId,
              feedSessionId: exposure.feedSessionId,
              requestId: exposure.requestId,
              algorithmVersion: exposure.algorithmVersion,
              experimentVariant: exposure.experimentVariant,
            }
          : {}),
      },
    });
  }, [engagementToken, slug]);

  useEffect(() => {
    const readSessionKey = sessionKey(READ_SESSION_KEY, slug);
    if (sessionStorage.getItem(readSessionKey)) return;

    const { activeSeconds: requiredSeconds, scrollDepth: requiredDepth } =
      qualifiedReadThresholds(wordCount);

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
      sessionStorage.setItem(readSessionKey, "1");
      void postEngagement(
        slug,
        "read",
        engagementToken,
        {
          readSeconds: activeSecondsRef.current,
          scrollDepth: maxScrollDepthRef.current,
        },
        exposureRef.current
      );
      relationship?.offerQualifiedReadNudge();
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
  }, [engagementToken, relationship, slug, wordCount]);

  return null;
}
