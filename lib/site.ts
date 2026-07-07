// TODO(gratitude): confirm production domain — this is a placeholder until the Indegenius domain is finalized.
export const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "indegenius.example";
export const SITE_URL = `https://www.${APP_DOMAIN}`;
export const SITE_NAME = "Indegenius";

// TODO(gratitude): confirm production domain — these mailboxes need to exist at the real domain before go-live.
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
