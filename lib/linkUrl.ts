/**
 * What a writer typed into a link box, as an address a reader can follow, or
 * null when it is not one.
 *
 * Writers type "bbc.co.uk/news", not "https://bbc.co.uk/news", so a missing
 * scheme is added. What is refused is anything a reader could not open: a word
 * with no domain ("hrbdbf" used to become a link to indegenius.africa/hrbdbf),
 * a script or data address, or text with spaces in it. The address is kept as
 * typed apart from the added scheme, so a writer sees what they wrote.
 */
const BLOCKED_SCHEME = /^(javascript|data|vbscript|file|blob|about):/i;
const WEB_SCHEME = /^https?:\/\//i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function hasReachableHost(address: string) {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname;
  if (IPV4.test(host)) return true;
  const labels = host.split(".");
  if (labels.length < 2 || labels.some((label) => !label)) return false;
  const topLevel = labels[labels.length - 1];
  return /^[a-z]{2,}$/i.test(topLevel) || /^xn--[a-z0-9-]+$/i.test(topLevel);
}

export function normalizeLinkUrl(input: string): string | null {
  const typed = input.trim();
  if (!typed || /\s/.test(typed) || BLOCKED_SCHEME.test(typed)) return null;

  if (/^mailto:/i.test(typed)) {
    return /^mailto:[^@]+@[^@]+\.[^@]+$/i.test(typed) ? typed : null;
  }

  const address = WEB_SCHEME.test(typed)
    ? typed
    : typed.startsWith("//")
      ? `https:${typed}`
      : /^[a-z][a-z0-9+.-]*:\/\//i.test(typed)
        ? null
        : `https://${typed}`;

  return address && hasReachableHost(address) ? address : null;
}

/** Said wherever a link address is refused, so the two editors agree. */
export const INVALID_LINK_MESSAGE = "Enter a web address, like example.com.";
