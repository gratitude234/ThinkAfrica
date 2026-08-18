import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

interface EngagementTokenPayload {
  version: 1;
  tokenId: string;
  postId: string;
  slug: string;
  issuedAt: string;
}

const TOKEN_VERSION = 1;
const MAX_TOKEN_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 2 * 60 * 1000;
const TOKEN_PATTERN = /^([A-Za-z0-9_-]{1,2048})\.([A-Za-z0-9_-]{43})$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function getSigningSecret(): string | null {
  return (
    process.env.POST_ENGAGEMENT_SIGNING_SECRET?.trim() ||
    process.env.FEED_EXPOSURE_SIGNING_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    null
  );
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

export function createPostEngagementToken(
  postId: string,
  slug: string,
  issuedAt = new Date()
): string | null {
  const secret = getSigningSecret();
  if (!secret) return null;

  const payload: EngagementTokenPayload = {
    version: TOKEN_VERSION,
    tokenId: randomUUID(),
    postId,
    slug,
    issuedAt: issuedAt.toISOString(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyPostEngagementToken(
  token: unknown,
  expectedSlug: string,
  expectedPostId?: string
): EngagementTokenPayload | null {
  const secret = getSigningSecret();
  if (!secret || typeof token !== "string") return null;
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return null;

  const [, encoded, signature] = match;
  const expectedSignature = Buffer.from(sign(encoded, secret));
  const providedSignature = Buffer.from(signature);
  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return null;
  }

  try {
    const bytes = Buffer.from(encoded, "base64url");
    if (bytes.toString("base64url") !== encoded) return null;
    const payload = JSON.parse(bytes.toString("utf8")) as Partial<EngagementTokenPayload>;
    const issuedAtMs =
      typeof payload.issuedAt === "string" ? Date.parse(payload.issuedAt) : NaN;
    const now = Date.now();
    if (
      payload.version !== TOKEN_VERSION ||
      typeof payload.tokenId !== "string" ||
      !SAFE_ID.test(payload.tokenId) ||
      typeof payload.postId !== "string" ||
      !SAFE_ID.test(payload.postId) ||
      payload.slug !== expectedSlug ||
      (expectedPostId !== undefined && payload.postId !== expectedPostId) ||
      !Number.isFinite(issuedAtMs) ||
      new Date(issuedAtMs).toISOString() !== payload.issuedAt ||
      issuedAtMs > now + MAX_FUTURE_SKEW_MS ||
      now - issuedAtMs > MAX_TOKEN_AGE_MS
    ) {
      return null;
    }

    return payload as EngagementTokenPayload;
  } catch {
    return null;
  }
}
