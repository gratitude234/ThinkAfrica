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
