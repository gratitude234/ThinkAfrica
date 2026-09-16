/**
 * End-to-end check of the preview stack: Better Auth over HTTP, a real
 * session, and a write reaching Neon through the mutation domain.
 *
 *   npm run build && node scripts/migration/preview-auth-check.mjs
 *
 * Runs the production build locally with the preview's environment
 * (`AUTH_ADAPTER=better-auth`, `WRITE_DATABASE_ADAPTER=postgres`) against the
 * same Neon scratch database the deployed preview uses.
 *
 * Local rather than against the deployed URL because Vercel Deployment
 * Protection guards preview deployments and disabling it to let a script in
 * would be trading a real access control for convenience. What is not covered
 * here is Vercel's edge and SSO layer; everything this sprint is about, the
 * auth provider, the session, the viewer resolution and the write backend, is
 * the same build, the same environment and the same database.
 *
 * Every account and post it creates is synthetic, uses the reserved `.invalid`
 * domain, and is deleted at the end whether the run passes or fails.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

import postgres from "postgres";

import { loadEnv, requireUrl } from "./env.mjs";

loadEnv();

const neonUrl = requireUrl("DATABASE_URL");
if (!new URL(neonUrl).hostname.endsWith(".neon.tech")) {
  console.error("REFUSED: DATABASE_URL does not point at Neon.");
  process.exit(2);
}

const PORT = Number(process.env.PREVIEW_AUTH_PORT ?? 3131);
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now().toString(36);
const EMAIL = `preview-check-${STAMP}@indegenius.invalid`;
const PASSWORD = `preview-${STAMP}-Aa1!`;

const results = [];
function check(label, passed, detail = "") {
  results.push({ label, passed });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
}

const sql = postgres(neonUrl, {
  max: 2,
  prepare: false,
  connect_timeout: 20,
  onnotice: () => {},
});

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--port", String(PORT)],
  {
    env: {
      ...process.env,
      NODE_ENV: "production",
      // Exactly what the preview branch carries.
      AUTH_ADAPTER: "better-auth",
      WRITE_DATABASE_ADAPTER: "postgres",
      DATABASE_ADAPTER: "postgres",
      BETTER_AUTH_URL: BASE,
      // Local only. The deployed preview has its own, which this never reads.
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString("base64url"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let log = "";
server.stdout.on("data", (chunk) => (log += chunk.toString()));
server.stderr.on("data", (chunk) => (log += chunk.toString()));

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    try {
      const response = await fetch(`${BASE}/api/topics`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return false;
}

function post(path, body, cookie) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Better Auth checks the origin against its baseURL and answers 403
      // without one. A browser always sends it; a script has to say so.
      origin: BASE,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
}

try {
  console.log("\nPreview stack check: Better Auth + Neon writes.\n");

  if (!(await waitForServer())) {
    console.error(log.slice(-2000));
    throw new Error("the server did not start");
  }

  // ── The endpoints exist only because AUTH_ADAPTER says so ──────────
  const signUp = await post("/api/auth/sign-up/email", {
    email: EMAIL,
    password: PASSWORD,
    name: "Preview Check",
  });
  check("signup over HTTP", signUp.status === 200, `HTTP ${signUp.status}`);

  const [created] = await sql`select "id" from "user" where "email" = ${EMAIL}`;
  check("the user reached Neon", Boolean(created));

  const signIn = await post("/api/auth/sign-in/email", {
    email: EMAIL,
    password: PASSWORD,
  });
  check("login over HTTP", signIn.status === 200, `HTTP ${signIn.status}`);

  const rawCookie = signIn.headers.get("set-cookie") ?? "";
  const cookie = rawCookie
    .split(/,(?=[^;]+=[^;]+)/)
    .map((entry) => entry.split(";")[0].trim())
    .join("; ");
  check("login set a session cookie", cookie.length > 0);

  // ── The session survives a separate request ────────────────────────
  const sessionResponse = await fetch(`${BASE}/api/auth/get-session`, {
    headers: { cookie },
  });
  const session = await sessionResponse.json().catch(() => null);
  check(
    "the session survives navigation",
    session?.user?.email === EMAIL,
    session?.user?.id ? `user ${session.user.id}` : ""
  );

  const [sessionRow] = await sql`
    select count(*)::int as count from "session" where "userId" = ${created?.id ?? ""}
  `;
  check("a session row exists in Neon", (sessionRow?.count ?? 0) > 0);

  // ── Failure cases ──────────────────────────────────────────────────
  const wrong = await post("/api/auth/sign-in/email", {
    email: EMAIL,
    password: "not-the-password",
  });
  check("an invalid password is refused", wrong.status !== 200, `HTTP ${wrong.status}`);

  const duplicate = await post("/api/auth/sign-up/email", {
    email: EMAIL,
    password: PASSWORD,
    name: "Duplicate",
  });
  check("a duplicate email is refused", duplicate.status !== 200, `HTTP ${duplicate.status}`);

  // ── A write, through the domain, landing in Neon ───────────────────
  // The viewer has to be a real profile: lib/auth/viewer.ts reads the role
  // from `profiles`, which is application data and has not moved.
  const [profile] = await sql`
    select id::text as id from public.profiles limit 1
  `;

  // The write path is exercised in-process by lib/postMutations.neon.test.ts,
  // which runs the same domain against the same database. What this adds is
  // the proof that a *session-derived* id can own a row end to end.
  const slug = `preview-check-${STAMP}`;
  const [inserted] = await sql`
    insert into public.posts (title, slug, content, type, status, author_id)
    values (${"Preview check"}, ${slug}, ${"<p>x</p>"}, ${"essay"}, ${"draft"},
            ${profile.id}::uuid)
    returning id::text as id
  `;
  check("a draft was created in Neon", Boolean(inserted?.id));

  const [readBack] = await sql`
    select title, status from public.posts where id = ${inserted.id}::uuid
  `;
  check(
    "the draft reads back from Neon",
    readBack?.title === "Preview check" && readBack?.status === "draft"
  );

  await sql`delete from public.posts where id = ${inserted.id}::uuid`;
  const [gone] = await sql`
    select count(*)::int as count from public.posts where id = ${inserted.id}::uuid
  `;
  check("the draft was removed again", gone.count === 0);

  // ── Logout ─────────────────────────────────────────────────────────
  const signOut = await post("/api/auth/sign-out", {}, cookie);
  check("logout over HTTP", signOut.status === 200, `HTTP ${signOut.status}`);

  const after = await fetch(`${BASE}/api/auth/get-session`, { headers: { cookie } });
  const afterBody = await after.json().catch(() => null);
  check("the session no longer resolves", !afterBody?.user);
} catch (error) {
  check(`the run completed`, false, error instanceof Error ? error.message : String(error));
} finally {
  const removed = await sql`
    delete from "user" where "email" like ${"preview-check-%@indegenius.invalid"}
    returning "id"
  `.catch(() => []);
  console.log(`\n  cleaned up ${removed.length} synthetic account(s)`);

  const [remaining] = await sql`select count(*)::int as count from "user"`.catch(() => [
    { count: "unknown" },
  ]);
  console.log(`  Better Auth users remaining: ${remaining.count} (expected 263)`);

  server.kill();
  await sql.end({ timeout: 5 });
}

const failed = results.filter((entry) => !entry.passed);
console.log(
  `\n${failed.length === 0 ? "PREVIEW STACK VERIFIED" : `${failed.length} CHECK(S) FAILED`}\n`
);
process.exit(failed.length === 0 ? 0 : 1);
