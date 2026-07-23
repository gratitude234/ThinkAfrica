import type { ContentKind } from "@/lib/contentModel";

export type GuestAuthIntent = "like" | "save" | "respond" | "create";

const CONTENT_KIND_LABEL: Record<ContentKind, string> = {
  post: "Post",
  article: "Article",
  research: "Research",
};

/** Human-facing label for a content kind -- never the raw DB value. */
export function getContentKindLabel(contentKind?: ContentKind | null): string | null {
  if (!contentKind) return null;
  return CONTENT_KIND_LABEL[contentKind] ?? null;
}

export interface GuestAuthCopy {
  title: string;
  description: string;
}

const GENERIC_DESCRIPTION =
  "Join Indegenius to take part in Africa's intellectual social network.";

export function getGuestAuthCopy(
  intent: GuestAuthIntent,
  contentKind?: ContentKind | null
): GuestAuthCopy {
  const kindLabel = getContentKindLabel(contentKind);

  switch (intent) {
    case "like":
      return {
        title: kindLabel ? `Sign in to like this ${kindLabel}` : "Sign in to like this",
        description: GENERIC_DESCRIPTION,
      };
    case "save":
      return {
        title: kindLabel ? `Sign in to save this ${kindLabel}` : "Sign in to save this",
        description: GENERIC_DESCRIPTION,
      };
    case "respond":
      return {
        title: "Sign in to respond",
        description: GENERIC_DESCRIPTION,
      };
    case "create":
      return {
        title: "Sign in to publish",
        description: GENERIC_DESCRIPTION,
      };
    default:
      return {
        title: "Sign in to continue",
        description: GENERIC_DESCRIPTION,
      };
  }
}

/** The current relative URL (pathname + query + hash), for `redirectTo`. */
export function getCurrentRelativePath(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/**
 * Builds a same-origin `/login?redirectTo=...` href from a relative path.
 * Only ever called with a same-origin path read from `window.location`, but
 * still guards against an open redirect the way the login page's own
 * `getSafeRedirect` (app/(auth)/authMessages.ts) does, in case a caller ever
 * passes something else in.
 */
export function buildLoginHref(relativePath: string): string {
  const safePath =
    relativePath.startsWith("/") && !relativePath.startsWith("//")
      ? relativePath
      : "/";
  return `/login?redirectTo=${encodeURIComponent(safePath)}`;
}
