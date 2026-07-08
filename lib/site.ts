// Falls back to the confirmed production domain if NEXT_PUBLIC_APP_DOMAIN
// isn't set in the environment (e.g. Vercel). Prefer setting the env var so
// preview/staging deployments can differ from production.
export const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "indegenius.africa";
export const SITE_URL = `https://www.${APP_DOMAIN}`;
export const SITE_NAME = "Indegenius";

// Confirm these mailboxes exist at the real domain before relying on them.
export const CONTACT_EMAILS = {
  privacy: `privacy@${APP_DOMAIN}`,
  legal: `legal@${APP_DOMAIN}`,
  editorial: `editorial@${APP_DOMAIN}`,
};
export const DEFAULT_OG_IMAGE = "/og-default.png";

export function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalizedPath}`;
}

export function canonicalPath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}
