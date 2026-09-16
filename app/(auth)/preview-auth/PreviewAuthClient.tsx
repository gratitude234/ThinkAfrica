"use client";

import { useState } from "react";
import { createAuthClient } from "better-auth/react";

/**
 * The migration rehearsal's sign-in surface.
 *
 * Deliberately plain, and deliberately not the real login page. The real one
 * is Supabase's and must keep working untouched; this exists so the Better
 * Auth cutover can be exercised in a browser against the preview without
 * changing a single line of the page members actually use.
 *
 * It talks to `/api/auth/*`, which answers 404 unless `AUTH_ADAPTER` is
 * `better-auth`. On production that is exactly what happens.
 *
 * No password is logged, stored or sent anywhere but Better Auth's own
 * endpoint over HTTPS.
 */

const auth = createAuthClient();

type Outcome = { kind: "idle" | "working" | "ok" | "error"; message: string };

export default function PreviewAuthClient() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle", message: "" });
  const [session, setSession] = useState<string>("not checked");

  async function run(label: string, action: () => Promise<{ error?: unknown }>) {
    setOutcome({ kind: "working", message: `${label}...` });
    try {
      const result = await action();
      if (result?.error) {
        const message =
          typeof result.error === "object" && result.error !== null
            ? String((result.error as { message?: string }).message ?? "failed")
            : "failed";
        setOutcome({ kind: "error", message: `${label}: ${message}` });
        return;
      }
      setOutcome({ kind: "ok", message: `${label}: ok` });
    } catch (error) {
      setOutcome({
        kind: "error",
        message: `${label}: ${error instanceof Error ? error.message : "failed"}`,
      });
    }
  }

  async function checkSession() {
    const { data } = await auth.getSession();
    // The id, not the address: enough to prove which account is signed in and
    // that it kept the UUID it had in Supabase.
    setSession(data?.user ? `signed in as ${data.user.id}` : "no session");
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Migration preview sign-in</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Better Auth against the Neon scratch database. This page is not the
          real login and does not exist in production.
        </p>
      </div>

      <label className="block text-sm">
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 w-full rounded border border-green-wash-border px-3 py-2"
          autoComplete="username"
        />
      </label>

      <label className="block text-sm">
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded border border-green-wash-border px-3 py-2"
          autoComplete="current-password"
        />
      </label>

      <label className="block text-sm">
        Name (signup only)
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full rounded border border-green-wash-border px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-emerald-brand px-3 py-2 text-sm text-white"
          onClick={() => run("sign in", () => auth.signIn.email({ email, password }))}
        >
          Sign in
        </button>
        <button
          type="button"
          className="rounded border border-emerald-brand px-3 py-2 text-sm text-emerald-brand"
          onClick={() =>
            run("sign up", () => auth.signUp.email({ email, password, name }))
          }
        >
          Sign up
        </button>
        <button
          type="button"
          className="rounded border border-green-wash-border px-3 py-2 text-sm"
          onClick={() => run("sign out", () => auth.signOut())}
        >
          Sign out
        </button>
        <button
          type="button"
          className="rounded border border-green-wash-border px-3 py-2 text-sm"
          onClick={checkSession}
        >
          Check session
        </button>
      </div>

      <p
        className={
          outcome.kind === "error"
            ? "text-sm text-red-700"
            : "text-sm text-ink-muted"
        }
        role="status"
      >
        {outcome.message || "Ready."}
      </p>

      <p className="text-sm text-ink-muted">Session: {session}</p>
    </div>
  );
}
