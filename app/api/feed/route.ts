import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchFeedPage,
  FeedCursorError,
  MAX_FEED_PAGE,
  MAX_FEED_PAGE_SIZE,
  normalizeFeedContentFilter,
  RANKED_FEED_WINDOW,
  type FeedTabKey,
  type FeedTimeframe,
} from "@/lib/feedData";
import { prepareFeedPageForClient } from "@/lib/feedExposure";
import { loadFeedViewer } from "@/lib/feedViewer";

const FEED_SESSION_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * For You or Following. A retired mode (`latest`, `subscriptions`, `topics`)
 * from a page loaded before Phase 2F falls back to For You rather than
 * failing, and its cursor is refused, which the client already recovers from.
 */
function getTab(param: string | null): FeedTabKey {
  return param === "following" ? "following" : "home";
}

function getTimeframe(param: string | null): FeedTimeframe {
  if (param === "week" || param === "month") return param;
  return "all";
}

function getType(param: string | null) {
  const normalized = normalizeFeedContentFilter(param);
  return normalized === "all" ? null : normalized;
}

/**
 * Explore's Trending shelf is deliberately global: its first page is rendered
 * with no viewer signals so everyone sees the same week. Without this flag the
 * continuation request would be personalized for a signed-in reader, so page 2
 * would be ranked against a different feed than page 1 and the reader would
 * see repeats and gaps across the seam. Blocking is deliberately NOT waived
 * here -- a depersonalized shelf still must not surface a blocked author.
 */
function isPersonalized(param: string | null) {
  return param !== "0";
}

function getPositiveInteger(
  param: string | null,
  fallback: number,
  maximum: number
) {
  const value = Number(param ?? fallback);
  if (!Number.isFinite(value) || value < 1 || value > maximum) return null;
  return Math.floor(value);
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const page = getPositiveInteger(params.get("page"), 1, MAX_FEED_PAGE);
    const pageSize = getPositiveInteger(
      params.get("pageSize"),
      12,
      MAX_FEED_PAGE_SIZE
    );
    if (page === null || pageSize === null) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_PAGINATION",
            message: `page must be 1-${MAX_FEED_PAGE} and pageSize must be 1-${MAX_FEED_PAGE_SIZE}.`,
          },
        },
        { status: 400 }
      );
    }
    const supabase = await createClient();
    const tab = getTab(params.get("tab"));
    const requestedFeedSessionId = params.get("session");
    const feedSessionId =
      requestedFeedSessionId && FEED_SESSION_PATTERN.test(requestedFeedSessionId)
        ? requestedFeedSessionId
        : undefined;

    const claimsResult = await supabase.auth.getClaims();
    const claims = claimsResult.data?.claims ?? null;
    const userId = typeof claims?.sub === "string" ? claims.sub : null;

    const viewer = await loadFeedViewer(supabase, userId, {
      personalized: isPersonalized(params.get("personalized")),
    });

    const result = await fetchFeedPage({
      supabase,
      tab,
      page,
      pageSize,
      type: getType(params.get("type")),
      timeframe: getTimeframe(params.get("timeframe")),
      ...viewer,
      cursor: params.get("cursor"),
    });

    return NextResponse.json(
      prepareFeedPageForClient(result, {
        tab,
        page,
        pageSize,
        rankedWindow: RANKED_FEED_WINDOW,
        feedSessionId,
      })
    );
  } catch (error) {
    if (error instanceof FeedCursorError) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_CURSOR",
            message: "The feed cursor is invalid or no longer matches this view.",
          },
        },
        { status: 400 }
      );
    }
    console.error("[feed-api] failed to load feed", error);
    return NextResponse.json(
      {
        error: {
          code: "FEED_UNAVAILABLE",
          message: "The feed could not be loaded. Please try again.",
        },
      },
      { status: 500 }
    );
  }
}
