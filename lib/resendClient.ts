import "server-only";

import { Resend } from "resend";

/**
 * One Resend client for the whole server.
 *
 * Transactional email and broadcasts both talk to Resend, and giving each its
 * own client would mean two HTTP pools and two places to change when the key
 * moves. The client is created lazily because most requests never send email,
 * and returns null when no key is configured so callers can skip rather than
 * throw in an environment that was never meant to send.
 */
let resendClient: Resend | null = null;

export function getResendClient() {
  if (!process.env.RESEND_API_KEY) return null;
  resendClient ??= new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

/** Thrown when Resend answers with an error rather than a transport failure. */
export class ResendApiError extends Error {
  readonly operation: string;
  readonly code: string | null;
  readonly statusCode: number | null;

  constructor(
    operation: string,
    message: string,
    code: string | null = null,
    statusCode: number | null = null
  ) {
    super(`Resend ${operation} failed: ${message}`);
    this.name = "ResendApiError";
    this.operation = operation;
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * True when Resend is asking us to slow down rather than telling us the
 * request was wrong. The sync treats this as "stop this run", not as a per
 * contact failure: marking twelve thousand contacts errored because the
 * account hit its per-second limit would be the wrong lesson to record.
 */
export function isResendRateLimited(error: unknown) {
  return (
    error instanceof ResendApiError &&
    (error.code === "rate_limit_exceeded" ||
      error.code === "daily_quota_exceeded" ||
      error.code === "monthly_quota_exceeded" ||
      error.statusCode === 429)
  );
}

/**
 * Resend error names that describe the request rather than the moment: the
 * broadcast, the address or the key was wrong, and sending the identical
 * request again would be wrong in the identical way.
 */
const DEFINITIVE_REJECTION_CODES = new Set([
  "validation_error",
  "invalid_parameter",
  "invalid_attachment",
  "invalid_from_address",
  "invalid_to_address",
  "invalid_access",
  "invalid_scope",
  "missing_required_field",
  "restricted_api_key",
  "method_not_allowed",
  "not_found",
  "security_error",
]);

/**
 * True when Resend has told us the request itself was unacceptable, rather
 * than that something went wrong on the way to it.
 *
 * The distinction matters in exactly one place: a broadcast that failed at
 * broadcasts.send. A timeout leaves us unable to prove the send was not
 * accepted, so the row stays locked. A validation rejection is Resend saying
 * it never started. That is not on its own permission to unlock: it is only a
 * reason to go and ask Resend what state the broadcast is actually in, and
 * the answer is what decides.
 *
 * 408, 409 and 425 are 4xx codes meaning "not now" rather than "not ever", so
 * they are excluded alongside the rate limits.
 */
export function isResendDefinitiveRejection(error: unknown) {
  if (!(error instanceof ResendApiError)) return false;
  if (isResendRateLimited(error)) return false;

  const status = error.statusCode;
  if (status !== null) {
    if (status === 408 || status === 409 || status === 425) return false;
    return status >= 400 && status < 500;
  }

  // Older SDK error payloads carry a name and no status code at all, so the
  // name is the only thing left to read.
  return DEFINITIVE_REJECTION_CODES.has(error.code ?? "");
}

export class ResendNotConfiguredError extends Error {
  constructor() {
    super("RESEND_API_KEY is not configured.");
    this.name = "ResendNotConfiguredError";
  }
}

export function requireResendClient() {
  const client = getResendClient();
  if (!client) throw new ResendNotConfiguredError();
  return client;
}

type ResendResult<T> = { data: T | null; error: unknown };

function readErrorField(error: unknown, field: string) {
  if (typeof error !== "object" || error === null || !(field in error)) {
    return null;
  }
  return (error as Record<string, unknown>)[field] ?? null;
}

export function resendApiError(operation: string, error: unknown) {
  const message = readErrorField(error, "message");
  const code = readErrorField(error, "name");
  const statusCode = readErrorField(error, "statusCode");

  return new ResendApiError(
    operation,
    message === null ? String(error) : String(message),
    code === null ? null : String(code),
    typeof statusCode === "number" ? statusCode : null
  );
}

/**
 * Every Resend SDK call answers `{ data, error }` rather than throwing, which
 * is easy to forget at a call site. Funnelling them through here means an
 * ignored error is impossible: either data comes back or this throws.
 */
export function unwrapResend<T>(operation: string, result: ResendResult<T>): T {
  if (result.error) {
    throw resendApiError(operation, result.error);
  }

  if (result.data === null || result.data === undefined) {
    throw new ResendApiError(operation, "Resend returned no data.");
  }

  return result.data;
}
