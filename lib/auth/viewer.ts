import "server-only";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/serverAuth";
import { resolveAuthAdapter } from "@/lib/auth/betterAuth";
import type { PostActor } from "@/lib/postPolicy";
import type { AppRole } from "@/lib/roles";

/**
 * Who is acting, resolved from whichever authentication the deployment runs.
 *
 * One function, two implementations, one contract: the id comes from a
 * verified session and the role comes from the database. Neither is ever read
 * from a request body, a header the caller controls, or session metadata.
 *
 * ## Why the role is not taken from the session
 *
 * Better Auth can carry arbitrary fields on a session, and it would be
 * convenient to put `role` there. This product treats `profiles.role` as
 * authoritative: `lib/adminAccess.ts` reads it, `lib/roles.ts` interprets it,
 * and an admin is additionally anybody whose email matches `ADMIN_EMAIL`. A
 * role copied into a session at login is a role that keeps its old value until
 * the session expires, so demoting somebody would not take effect until they
 * signed out. The session says who; the database says what they may do.
 *
 * ## What this is for
 *
 * `lib/postPolicy.ts` takes a `PostActor` and never resolves one. This is the
 * only place that resolves one, which is what makes "identity is never a
 * parameter a browser can choose" checkable rather than a convention.
 */

export interface Viewer {
  userId: string;
  role: AppRole;
  email: string | null;
}

/** The Better Auth session, read server-side from the request's cookies. */
async function betterAuthUserId(): Promise<string | null> {
  const { createRehearsalAuth } = await import("@/lib/auth/betterAuth");
  const auth = createRehearsalAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

async function supabaseUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

/**
 * The acting user's id, from the live authentication provider.
 *
 * `AUTH_ADAPTER` decides which. Unset means Supabase, which is production.
 */
export async function resolveViewerId(): Promise<string | null> {
  return resolveAuthAdapter() === "better-auth"
    ? betterAuthUserId()
    : supabaseUserId();
}

/**
 * The acting user, with the role the database says they have.
 *
 * The role lookup goes through Supabase in both cases, and deliberately so:
 * `profiles` is application data, it has not moved, and reading it from
 * somewhere else would mean a viewer's identity and their permissions came
 * from two databases that can disagree.
 */
export async function resolveViewer(): Promise<Viewer | null> {
  const userId = await resolveViewerId();
  if (!userId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("role, signup_email")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // A failed role lookup is not "no role". Treating it as one would silently
    // demote every editor during a database blip, which fails safe for writes
    // and fails badly for the editorial queue, so it is an error either way.
    throw new Error(`viewer role lookup failed: ${error.message.slice(0, 200)}`);
  }

  const row = (data ?? null) as { role?: string | null; signup_email?: string | null } | null;
  const stored = row?.role;
  const role: AppRole =
    stored === "admin" || stored === "editor" || stored === "reviewer"
      ? stored
      : "student";

  return { userId, role, email: row?.signup_email ?? null };
}

/**
 * The viewer as a `PostActor`.
 *
 * The mapping is deliberately narrow. `system` is never produced here: it is
 * the editorial machinery's own capability, granted in code at the call site
 * that runs it, and a viewer must never be able to become one by having a
 * role. A reviewer is not an editor for the purposes of post writes, because
 * `canReview` and `canPublish` are different questions and only the second one
 * decides a lifecycle transition.
 */
export function actorFor(viewer: Viewer): PostActor {
  if (viewer.role === "admin") return { kind: "admin", userId: viewer.userId };
  if (viewer.role === "editor") return { kind: "editor", userId: viewer.userId };
  return { kind: "author", userId: viewer.userId };
}

/** The two together, for a server action that needs an actor and nothing else. */
export async function resolveActor(): Promise<PostActor | null> {
  const viewer = await resolveViewer();
  return viewer ? actorFor(viewer) : null;
}
