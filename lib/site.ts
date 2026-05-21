export const SITE_URL = "https://www.thinkafrica.africa";
export const SITE_NAME = "ThinkAfrica";
export const DEFAULT_OG_IMAGE = "/og-default.png";

export function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalizedPath}`;
}

export function canonicalPath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}
