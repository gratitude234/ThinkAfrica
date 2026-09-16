/**
 * The Supabase database-usage inventory behind docs/database-access-inventory.md.
 *
 * One-off migration tooling, not part of the app build. It walks every .ts/.tsx
 * file under app/, components/, lib/, scripts/ and proxy.ts, and records each
 * PostgREST table touch, RPC call, Storage call and Auth call, together with
 * where in the runtime it executes and which Supabase client issued it.
 *
 * Static analysis, so it is a floor rather than a ceiling: a table name built
 * from a variable will not be seen. Every call site in this repository names
 * its table as a literal, which is why the technique is worth using at all.
 *
 * Run: node scripts/audit/dbAudit.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOTS = ["app", "components", "lib", "scripts", "proxy.ts"];
const REPO = process.cwd();

/** Storage bucket ids. `.storage.from("avatars")` looks exactly like a table
 *  read to a regex, so the bucket names are listed rather than inferred. */
const STORAGE_BUCKETS = new Set([
  "avatars",
  "post-images",
  "audio-summaries",
  "research-documents",
  "research-project-assets",
]);

function walk(p, out = []) {
  let st;
  try {
    st = statSync(p);
  } catch {
    return out;
  }
  if (st.isFile()) {
    if (/\.(ts|tsx)$/.test(p)) out.push(p);
    return out;
  }
  for (const entry of readdirSync(p)) {
    if (entry === "node_modules" || entry === ".next") continue;
    walk(join(p, entry), out);
  }
  return out;
}

/** Where this file's code runs. Order matters: a route handler under
 *  app/api/cron is a cron job first and a route handler second. */
function executionLocation(posixPath, src) {
  if (posixPath === "proxy.ts") return "middleware";
  if (posixPath.startsWith("app/api/cron/")) return "cron";
  if (posixPath.startsWith("app/api/webhooks/")) return "webhook";
  if (posixPath.startsWith("app/api/")) return "route-handler";
  if (posixPath.startsWith("scripts/")) return "script";
  if (/^\s*["']use client["']/m.test(src)) return "browser";
  if (/^\s*["']use server["']/m.test(src)) return "server-action";
  if (/export\s+(async\s+)?function\s+generateMetadata/.test(src))
    return "server-component+metadata";
  if (/^(app|components)\//.test(posixPath)) return "server-component";
  return "lib";
}

/** Identifiers in this file that hold a service-role client. */
function serviceRoleBindings(src) {
  const names = new Set();
  const re =
    /(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:await\s+)?(createAdminClient|createCheckedAdminClient)\s*\(/g;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  // Parameters typed as the admin client, and direct chained calls, are picked
  // up by the per-line fallback instead.
  return names;
}

const OPERATIONS = [
  [/\.select\s*\(/, "SELECT"],
  [/\.insert\s*\(/, "INSERT"],
  [/\.upsert\s*\(/, "UPSERT"],
  [/\.update\s*\(/, "UPDATE"],
  [/\.delete\s*\(/, "DELETE"],
];

const rows = [];

for (const abs of ROOTS.flatMap((r) => walk(join(REPO, r)))) {
  const posixPath = relative(REPO, abs).split(sep).join("/");
  const src = readFileSync(abs, "utf8");
  const isTest = /\.test\.(ts|tsx)$/.test(posixPath);
  const location = executionLocation(posixPath, src);
  const adminNames = serviceRoleBindings(src);
  const fileUsesAdmin =
    adminNames.size > 0 || /createAdminClient|createCheckedAdminClient/.test(src);
  const lines = src.split(/\r?\n/);

  const push = (i, extra) =>
    rows.push({
      file: posixPath,
      line: i + 1,
      location,
      isTest,
      fileUsesServiceRole: fileUsesAdmin,
      ...extra,
    });

  lines.forEach((line, i) => {
    const receiverIsAdmin = [...adminNames].some((n) =>
      new RegExp(`\b${n}\b`).test(line)
    );

    let m;

    const fromRe = /([A-Za-z0-9_$]*)\s*\.from\(\s*["'`]([A-Za-z0-9_.\-]+)["'`]\s*\)/g;
    while ((m = fromRe.exec(line))) {
      const target = m[2];
      if (STORAGE_BUCKETS.has(target)) {
        push(i, { kind: "storage", target, operation: "STORAGE", serviceRole: receiverIsAdmin });
        continue;
      }
      if (target === "Array" || /^[A-Z]/.test(target)) continue;
      const window = lines.slice(i, i + 9).join("\n");
      const after = window.slice(window.indexOf(m[0]) + m[0].length, window.indexOf(m[0]) + 500);
      let operation = "SELECT";
      for (const [re, name] of OPERATIONS) {
        if (re.test(after)) {
          operation = name;
          break;
        }
      }
      push(i, {
        kind: "table",
        target,
        operation,
        serviceRole: receiverIsAdmin || (adminNames.size === 0 && fileUsesAdmin),
      });
    }

    const rpcRe = /\.rpc\(\s*["'`]([A-Za-z0-9_.]+)["'`]/g;
    while ((m = rpcRe.exec(line))) {
      push(i, {
        kind: "rpc",
        target: m[1],
        operation: "RPC",
        serviceRole: receiverIsAdmin || (adminNames.size === 0 && fileUsesAdmin),
      });
    }

    const authRe = /\.auth\.(?:admin\.)?(getUser|getSession|getUserById|signInWithPassword|signUp|signOut|updateUser|resetPasswordForEmail|exchangeCodeForSession|verifyOtp|refreshSession|resend|generateLink|listUsers|deleteUser)\b/g;
    while ((m = authRe.exec(line))) {
      push(i, {
        kind: "auth",
        target: m[1],
        operation: "AUTH",
        serviceRole: receiverIsAdmin || /\.auth\.admin\./.test(line),
      });
    }

    // A bucket held in a constant (admin.storage.from(BUCKET)) is invisible to
    // the literal match above, so every remaining .storage touch is recorded
    // with an unresolved target rather than dropped.
    if (
      /\.storage\b/.test(line) &&
      !/\.from\(/.test(line) &&
      !/\.from\(/.test(lines[i + 1] ?? "")
    ) {
      push(i, {
        kind: "storage",
        target: "(bucket held in a variable)",
        operation: "STORAGE",
        serviceRole: receiverIsAdmin || fileUsesAdmin,
      });
    }
  });
}

writeFileSync("scripts/audit/db-audit.json", JSON.stringify(rows, null, 1));

const prod = rows.filter((r) => !r.isTest);
const tally = (key, set = prod) =>
  set.reduce((acc, r) => ((acc[r[key]] = (acc[r[key]] || 0) + 1), acc), {});

console.log(`call sites: ${rows.length} total, ${prod.length} outside tests`);
console.log("by kind     ", tally("kind"));
console.log("by location ", tally("location"));
console.log("by operation", tally("operation"));
console.log("service role", prod.filter((r) => r.serviceRole).length);
console.log(
  "distinct tables/views:",
  new Set(prod.filter((r) => r.kind === "table").map((r) => r.target)).size
);
console.log(
  "distinct rpcs:",
  new Set(prod.filter((r) => r.kind === "rpc").map((r) => r.target)).size
);
