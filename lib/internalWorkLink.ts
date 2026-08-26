/**
 * Resolving a reference URL to the Indegenius work it points at.
 *
 * A citation edge has to survive an edit, a domain change and a slug rename,
 * so the durable form is a foreign key on `post_references`. This module is
 * the one place that decides whether a URL an author typed is an internal
 * work, and which one. It is deliberately strict: a wrong match invents a
 * citation that nobody made, which is worse than missing one.
 *
 * Pure string work, so the same function runs in the composer, in the server
 * action that saves references, and in the backfill.
 */

/** The two canonical shapes an on-platform work is addressed by. */
export type InternalWorkRef =
  | { kind: "slug"; value: string }
  | { kind: "citation_id"; value: string };

/**
 * Hosts that are this product. A reference to another Indegenius deployment
 * is not resolvable here, so only these are considered internal.
 *
 * `NEXT_PUBLIC_APP_URL` is included at call time rather than hardcoded, so a
 * preview deployment resolves its own links.
 */
const KNOWN_HOSTS = new Set([
  "indegenius.org",
  "www.indegenius.org",
  "indegenius.com",
  "www.indegenius.com",
  "localhost",
]);

function hostIsInternal(host: string, appUrl?: string | null) {
  const normalized = host.toLowerCase().replace(/:\d+$/, "");
  if (KNOWN_HOSTS.has(normalized)) return true;
  if (!appUrl) return false;
  try {
    return new URL(appUrl).host.toLowerCase().replace(/:\d+$/, "") === normalized;
  } catch {
    return false;
  }
}

/**
 * A slug is the last path segment of `/post/<slug>`. Anything with a further
 * segment is a different route (a comment anchor, an edit screen), and a
 * query string or fragment is not part of identity.
 */
const POST_PATH = /^\/post\/([A-Za-z0-9][A-Za-z0-9_-]{0,200})\/?$/;
const PUBLICATION_PATH = /^\/publication\/([A-Za-z0-9][A-Za-z0-9._-]{0,60})\/?$/;

/**
 * Reads the internal work a URL identifies, or null.
 *
 * Returns null for every external URL, every DOI, and every internal URL that
 * is not a work: a profile, a topic page, the record. Matching those would
 * attribute a citation to something that cannot be cited.
 */
export function parseInternalWorkRef(
  rawUrl: string | null | undefined,
  appUrl?: string | null
): InternalWorkRef | null {
  const candidate = rawUrl?.trim();
  if (!candidate) return null;

  let url: URL;
  try {
    // A bare path is internal by construction: an author pasting "/post/x"
    // can only mean this site.
    url = candidate.startsWith("/")
      ? new URL(candidate, "https://indegenius.org")
      : new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!candidate.startsWith("/") && !hostIsInternal(url.host, appUrl)) return null;

  const postMatch = POST_PATH.exec(url.pathname);
  if (postMatch) return { kind: "slug", value: postMatch[1] };

  const publicationMatch = PUBLICATION_PATH.exec(url.pathname);
  if (publicationMatch) {
    // Citation ids are issued uppercase; comparison is case-insensitive so a
    // lowercased paste still resolves.
    return { kind: "citation_id", value: publicationMatch[1].toUpperCase() };
  }

  return null;
}

export interface ResolvableReference {
  id?: string | null;
  url?: string | null;
  doi?: string | null;
}

/**
 * The distinct internal works a set of references points at.
 *
 * Deduplicated by target: an author who cites the same piece three times in
 * one bibliography has made one citation edge, not three. Occurrence counts
 * are deliberately not produced; nothing in the product needs them, and a
 * count that can be inflated by repeating a line is a count worth gaming.
 */
export function collectInternalWorkRefs(
  references: ResolvableReference[],
  appUrl?: string | null
): InternalWorkRef[] {
  const seen = new Set<string>();
  const refs: InternalWorkRef[] = [];

  for (const reference of references) {
    const parsed = parseInternalWorkRef(reference.url, appUrl);
    if (!parsed) continue;
    const key = `${parsed.kind}:${parsed.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(parsed);
  }

  return refs;
}
