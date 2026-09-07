import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Zero direct database writes from browser code, enforced.
 *
 * Phase 1 found twenty of them: components holding an anon Supabase client and
 * issuing `.update()`, `.insert()`, `.upsert()` and `.delete()` against ids
 * they had been handed as props. Every one was safe only because RLS refused
 * the row when the id was wrong. A direct PostgreSQL connection has no such
 * refusal, so the whole set moved behind server actions and route handlers
 * during Phase 2.
 *
 * Keeping it at zero is what this test is for. A regression here is not a
 * style problem: it is a write that will still work today, through RLS, and
 * will silently become unauthorized the day the adapter changes.
 *
 * Deliberately a source scan rather than a lint rule. The property is about
 * the combination of two things in one file (a "use client" directive and a
 * PostgREST mutation), which is exactly what a whole-file check can see and a
 * per-node lint rule cannot state.
 */

const ROOTS = ["app", "components", "lib"];
const REPO = process.cwd();

const MUTATIONS = ["insert", "update", "upsert", "delete"] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.(ts|tsx)$/.test(full) && !/\.test\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

interface ClientFile {
  path: string;
  source: string;
}

const clientFiles: ClientFile[] = ROOTS.flatMap((root) =>
  walk(join(REPO, root))
).flatMap((absolute) => {
  const source = readFileSync(absolute, "utf8");
  if (!/^\s*["']use client["']/m.test(source)) return [];
  return [{ path: relative(REPO, absolute).split(sep).join("/"), source }];
});

/** `.from("table")` followed, within the same statement, by a mutation. The
 *  window is generous because these chains are formatted across lines. */
function findBrowserWrites(source: string): string[] {
  const found: string[] = [];
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    const fromMatch = /\.from\(\s*["'`]([A-Za-z0-9_]+)["'`]\s*\)/.exec(line);
    if (!fromMatch) return;
    const window = lines.slice(index, index + 6).join("\n");
    for (const mutation of MUTATIONS) {
      if (new RegExp(`\\.${mutation}\\s*\\(`).test(window)) {
        found.push(`${mutation.toUpperCase()} ${fromMatch[1]} (line ${index + 1})`);
        return;
      }
    }
  });

  return found;
}

describe("browser database writes", () => {
  it("finds client components to check, so a broken scan is not a pass", () => {
    // If the walk or the directive match ever breaks, every other assertion
    // here passes vacuously. This is the guard against that.
    expect(clientFiles.length).toBeGreaterThan(50);
  });

  it("are zero across every client component", () => {
    const offenders = clientFiles
      .map((file) => ({ path: file.path, writes: findBrowserWrites(file.source) }))
      .filter((file) => file.writes.length > 0)
      .map((file) => `${file.path}: ${file.writes.join(", ")}`);

    expect(offenders).toEqual([]);
  });

  it("are zero through the RPC path as well", () => {
    // A SECURITY DEFINER function called from the browser is a write with a
    // different shape, and the onboarding flow was five of them. They moved to
    // app/(onboarding)/onboarding/actions.ts and the comment vote moved to
    // commentActions.ts, so what is left below is reads only.
    //
    // The list is exhaustive on purpose. Adding an RPC to a client component
    // fails this test, which forces the question of whether it writes.
    const READ_ONLY_BROWSER_RPCS = new Set([
      // The member's own onboarding and profile state, rendered during setup.
      "get_my_profile_private",
      "get_my_onboarding_state",
      "get_public_profile_record_summary",
    ]);

    const unexpected: string[] = [];
    for (const file of clientFiles) {
      const pattern = /\.rpc\(\s*["'`]([A-Za-z0-9_]+)["'`]/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(file.source))) {
        if (!READ_ONLY_BROWSER_RPCS.has(match[1])) {
          unexpected.push(`${file.path}: ${match[1]}`);
        }
      }
    }

    expect(unexpected).toEqual([]);
  });

  it("never let a client component import a server-only module", () => {
    // `server-only` throws at build time if a client bundle reaches it, so
    // this is belt and braces. It is here because the failure it prevents is
    // a database URL in a browser bundle, and that is worth two checks.
    const SERVER_ONLY_MODULES = [
      "@/lib/supabase/admin",
      "@/lib/db",
      "@/lib/postDeletion",
      "@/lib/profileMutations",
      "@/lib/rateLimit",
      "@/lib/contactRequests",
      "@/lib/serverActions",
    ];

    const offenders: string[] = [];
    for (const file of clientFiles) {
      for (const moduleName of SERVER_ONLY_MODULES) {
        if (new RegExp(`from ["'\`]${moduleName}(/[^"'\`]*)?["'\`]`).test(file.source)) {
          offenders.push(`${file.path} imports ${moduleName}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
