import { notFound } from "next/navigation";

import { resolveAuthAdapter } from "@/lib/auth/betterAuth";
import PreviewAuthClient from "./PreviewAuthClient";

/**
 * The migration rehearsal's sign-in page.
 *
 * Absent unless `AUTH_ADAPTER` is `better-auth`. Production does not set it, so
 * this is a 404 there: the page ships in the bundle and cannot be reached,
 * which is the same posture as the /api/auth handler it talks to.
 */
export const dynamic = "force-dynamic";

export default function PreviewAuthPage() {
  if (resolveAuthAdapter() !== "better-auth") notFound();
  return <PreviewAuthClient />;
}
