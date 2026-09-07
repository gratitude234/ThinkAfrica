import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  GLOBAL_BURST_LIMIT,
  GLOBAL_BURST_WINDOW_MS,
  PER_ADDRESS_HOURLY_LIMIT,
  PER_ADDRESS_WINDOW_MS,
  PER_EMAIL_DAILY_LIMIT,
  PER_EMAIL_WINDOW_MS,
  validateContactRequest,
} from "@/lib/contactRequests";
import { checkRateLimit, clientAddress } from "@/lib/rateLimit";

/**
 * The partnerships contact form, which used to insert straight into
 * `contact_requests` from the browser with `WITH CHECK (true)` underneath it.
 *
 * A route handler rather than a server action, for two reasons that are
 * specific to this one form: it is the only unauthenticated write in the
 * application, so there is no session to derive anything from and the caller's
 * address is the only key a limit can use; and 429 with `Retry-After` is a
 * meaningful answer that a server action's return value cannot express.
 *
 * Three limits, in increasing cost and increasing reliability:
 *
 *   1. Per address, in this process. No database round trip, so a client
 *      hammering one instance is refused before touching Postgres. Weak on
 *      its own (see lib/rateLimit.ts) and not relied on alone.
 *   2. Per email address, counted in the table. Durable and shared across
 *      instances. This is the one that actually bounds a determined caller.
 *   3. A global burst ceiling, also counted in the table, for a flood spread
 *      across many addresses that would slip past both.
 *
 * The reply never says which limit was hit, whether an address has submitted
 * before, or what the database said. A form that reports "you already sent
 * three today" is an oracle for whether an address has used the product.
 */

const GENERIC_FAILURE =
  "Your message could not be sent right now. Please try again later.";

export async function POST(request: Request) {
  const address = clientAddress(request.headers);

  const perAddress = checkRateLimit(
    `partner-contact:${address}`,
    { limit: PER_ADDRESS_HOURLY_LIMIT, windowMs: PER_ADDRESS_WINDOW_MS }
  );
  if (!perAddress.allowed) {
    return tooManyRequests(perAddress.retryAfterSeconds);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That submission could not be read." },
      { status: 400 }
    );
  }

  const validated = validateContactRequest(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  // Service role because the table is admin-read and the anon role should not
  // be able to reach it at all once the browser stops holding a client. The
  // authorization for this write is the validation and the limits above:
  // there is no viewer to check, by design.
  const admin = createAdminClient();
  const now = Date.now();

  const [perEmail, globalBurst] = await Promise.all([
    admin
      .from("contact_requests")
      .select("id", { count: "exact", head: true })
      .eq("email", validated.value.email)
      .gte("created_at", new Date(now - PER_EMAIL_WINDOW_MS).toISOString()),
    admin
      .from("contact_requests")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(now - GLOBAL_BURST_WINDOW_MS).toISOString()),
  ]);

  if (perEmail.error || globalBurst.error) {
    console.error("[partner-contact] rate-limit lookup failed", {
      perEmail: perEmail.error,
      globalBurst: globalBurst.error,
    });
    // Fail closed. An unbounded insert path is exactly what this route exists
    // to remove, so a limit that cannot be evaluated is not one to skip.
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 503 });
  }

  if ((perEmail.count ?? 0) >= PER_EMAIL_DAILY_LIMIT) {
    return tooManyRequests(Math.ceil(PER_EMAIL_WINDOW_MS / 1000));
  }
  if ((globalBurst.count ?? 0) >= GLOBAL_BURST_LIMIT) {
    return tooManyRequests(Math.ceil(GLOBAL_BURST_WINDOW_MS / 1000));
  }

  const { error } = await admin.from("contact_requests").insert(validated.value);

  if (error) {
    console.error("[partner-contact] insert failed", error);
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error:
        "You have sent several messages recently. Please try again a little later.",
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}
