import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

type RequestWithHeaders = Pick<Request, "headers">;

export function isCronRequestAuthorized(
  request: RequestWithHeaders,
  secret = process.env.CRON_SECRET
) {
  if (!secret) return false;

  const provided = request.headers.get("authorization");
  if (!provided) return false;

  const expected = `Bearer ${secret}`;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export function getCronAuthorizationError(request: RequestWithHeaders) {
  if (isCronRequestAuthorized(request)) return null;
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
