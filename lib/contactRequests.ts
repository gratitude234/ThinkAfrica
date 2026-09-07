import "server-only";

/**
 * Validation and abuse limits for the partnerships contact form.
 *
 * This form was the only unauthenticated write in the application, and its RLS
 * policy is `FOR INSERT WITH CHECK (true)`: literally nothing checked it. The
 * browser held an anon Supabase client, so anyone who read the page's
 * JavaScript could insert arbitrary rows into `contact_requests` at whatever
 * rate PostgREST would accept.
 *
 * Nothing here needs a paid service. What it needs is for the write to stop
 * being reachable without passing through code, which is what
 * `app/api/partner-contact/route.ts` establishes, and for that code to say no.
 */

export const CONTACT_FIELD_LIMITS = {
  name: 120,
  organization: 160,
  email: 254,
  message: 4000,
} as const;

/** Per address, per day. A partnership enquiry is not something anyone
 *  legitimately sends four times in a day. */
export const PER_EMAIL_DAILY_LIMIT = 3;
export const PER_EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Per IP, per hour, in the serving process. See lib/rateLimit.ts for why this
 *  is a first line rather than a guarantee. */
export const PER_ADDRESS_HOURLY_LIMIT = 5;
export const PER_ADDRESS_WINDOW_MS = 60 * 60 * 1000;

/** A flood spread across many addresses would slip past both limits above, so
 *  the table itself has a ceiling. Deliberately generous: it exists to bound an
 *  attack, not to shape normal traffic. */
export const GLOBAL_BURST_LIMIT = 60;
export const GLOBAL_BURST_WINDOW_MS = 10 * 60 * 1000;

export interface ContactRequestInput {
  name: string;
  organization: string;
  email: string;
  message: string;
}

export type ContactValidation =
  | { ok: true; value: ContactRequestInput }
  | { ok: false; error: string };

/**
 * Deliberately not an RFC 5322 implementation. The address is used to reply to
 * a human and to key a rate limit, so what matters is that it has one `@`, a
 * dot-bearing domain, no whitespace, and a sane length.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * Control characters, keeping the two that are meaningful in typed text:
 * newline (0x0A) and carriage return (0x0D).
 *
 * These values are read back by a person, in an admin list and later in an
 * email. A stray escape sequence in a name field is either a mistake or an
 * attempt to control how that output renders.
 */
const CONTROL_CHARACTERS =
  /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g;

function normalizeText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARACTERS, "").trim().slice(0, max);
}

/** Single-line fields additionally collapse whitespace, so a name cannot
 *  contain the line breaks that would let it forge structure in an email. */
function normalizeLine(value: unknown, max: number): string {
  return normalizeText(value, max).replace(/\s+/g, " ").trim().slice(0, max);
}

export function validateContactRequest(raw: unknown): ContactValidation {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "That submission could not be read." };
  }

  const input = raw as Record<string, unknown>;

  const name = normalizeLine(input.name, CONTACT_FIELD_LIMITS.name);
  const organization = normalizeLine(
    input.organization,
    CONTACT_FIELD_LIMITS.organization
  );
  const email = normalizeLine(input.email, CONTACT_FIELD_LIMITS.email).toLowerCase();
  const message = normalizeText(input.message, CONTACT_FIELD_LIMITS.message);

  if (!name) return { ok: false, error: "Add your name." };
  if (!organization) return { ok: false, error: "Add your organization." };
  if (!email || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Add a valid email address." };
  }
  if (message.length < 10) {
    return { ok: false, error: "Add a message of at least 10 characters." };
  }

  // Exactly four fields are returned, rebuilt rather than spread. The form
  // sends four; anything else is either a newer client than this server or
  // someone probing the column list, and neither is a reason to write an
  // unknown key into the table.
  return { ok: true, value: { name, organization, email, message } };
}
