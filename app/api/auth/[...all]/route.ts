import { NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";

import { createRehearsalAuth, resolveAuthAdapter } from "@/lib/auth/betterAuth";

/**
 * Better Auth's endpoints, for the migration preview only.
 *
 * Gated on `AUTH_ADAPTER`. Production does not set it, so `resolveAuthAdapter()`
 * answers `supabase` and every method here answers 404: the route exists in the
 * bundle and is unreachable, which is the state production should be in until
 * a cutover is deliberate.
 *
 * The 404 is deliberate rather than a 403. A disabled auth endpoint that says
 * "forbidden" tells an unauthenticated caller that an alternative
 * authentication system is present and switched off, which is a fact worth not
 * publishing.
 */

function disabled() {
  return new NextResponse(null, { status: 404 });
}

async function handle(
  request: Request,
  method: "GET" | "POST"
): Promise<Response> {
  if (resolveAuthAdapter() !== "better-auth") return disabled();

  const handlers = toNextJsHandler(createRehearsalAuth());
  return method === "GET" ? handlers.GET(request) : handlers.POST(request);
}

export async function GET(request: Request) {
  return handle(request, "GET");
}

export async function POST(request: Request) {
  return handle(request, "POST");
}
