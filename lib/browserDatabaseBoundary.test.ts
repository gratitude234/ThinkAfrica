import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Zero database reads from browser code, enforced by following the imports.
 *
 * ## Why the existing guard was not enough
 *
 * `lib/browserWriteBoundary.test.ts` scans files carrying a `"use client"`
 * directive. That is where the writes were when it was written, and it is not
 * where they stayed: `lib/notificationMutations.ts` carried five of them and
 * `lib/pushClient.ts` two, in helpers with no directive of their own, imported
 * by client components. The guard reported zero while the writes ran in the
 * browser.
 *
 * So this test does not ask what a file says about itself. It walks the import
 * graph from every client component and asks what is actually bundled with it.
 *
 * ## Three things the walk has to get right, each of which hid the truth once
 *
 * 1. **`import type` is erased.** Following it reports every module a client
 *    component borrows a type from as bundled with it. Before this was fixed
 *    the scan claimed the whole of `lib/db` was in the browser.
 * 2. **A `"use server"` module is replaced by RPC stubs.** Neither its body
 *    nor its imports are bundled, so the walk stops there. Following it
 *    reports every repository a server action touches.
 * 3. **A directive can follow a block comment.** Several server-action modules
 *    open with one, and a check that only skips line comments reads them as
 *    ordinary modules.
 *
 * ## What is allowed
 *
 * Supabase Auth and Supabase Storage. Production still uses both from the
 * browser, and neither is a database read: `supabase.auth.*` talks to GoTrue
 * and `supabase.storage.from("bucket")` talks to the storage API. Banning the
 * browser client outright would break login and avatar upload to satisfy a
 * scan.
 *
 * Database access has no exceptions.
 */

const ROOT = process.cwd();

function walk(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (["node_modules", ".next", ".git"].includes(entry)) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.tsx?$/.test(entry)) files.push(full);
  }
  return files;
}

const sources = new Map<string, string>();
for (const directory of ["app", "components", "lib"]) {
  for (const absolute of walk(join(ROOT, directory))) {
    sources.set(
      relative(ROOT, absolute).split(sep).join("/"),
      readFileSync(absolute, "utf8")
    );
  }
}

function strip(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** The opening directive, if any. Comments are stripped first; see note 3. */
function directive(source: string): "client" | "server" | null {
  const head = strip(source).replace(/^\s+/, "");
  const match = /^["']use (client|server)["']/.exec(head);
  return match ? (match[1] as "client" | "server") : null;
}

function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = specifier.slice(2);
  else if (specifier.startsWith(".")) {
    base = relative(ROOT, resolve(ROOT, dirname(fromFile), specifier))
      .split(sep)
      .join("/");
  } else return null;

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    if (sources.has(candidate)) return candidate;
  }
  return null;
}

/** Value imports only. See note 1. */
function importsOf(file: string): string[] {
  const out: string[] = [];
  const source = strip(sources.get(file) ?? "");

  for (const match of source.matchAll(
    /(?:^|\n)\s*(?:import|export)([\s\S]*?)from\s+["']([^"']+)["']/g
  )) {
    const clause = match[1];
    if (/^\s+type[\s{]/.test(clause)) continue;

    const named = /\{([\s\S]*)\}/.exec(clause);
    if (named) {
      const specifiers = named[1]
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const beforeBrace = clause.slice(0, clause.indexOf("{"));
      const hasValueDefault = /[A-Za-z_$][\w$]*\s*,/.test(beforeBrace);
      if (
        specifiers.length > 0 &&
        specifiers.every((entry) => /^type\s/.test(entry)) &&
        !hasValueDefault
      ) {
        continue;
      }
    }

    const target = resolveImport(file, match[2]);
    if (target) out.push(target);
  }
  return out;
}

/**
 * PostgREST table and function calls, excluding storage.
 *
 * `supabase.storage.from("avatars")` is the storage API and is allowed; the
 * bucket read in the avatar uploader is exactly that and must not be reported.
 */
function databaseCalls(source: string): string[] {
  const clean = strip(source);
  const found: string[] = [];

  for (const [label, pattern] of [
    ["from", /\.from\("([a-z_]+)"\)/g],
    ["rpc", /\.rpc\("([a-z_0-9]+)"/g],
  ] as const) {
    for (const match of clean.matchAll(pattern)) {
      const before = clean.slice(Math.max(0, match.index - 60), match.index);
      if (/storage[\s\S]{0,10}$/.test(before)) continue;
      found.push(`${label}("${match[1]}")`);
    }
  }
  return found;
}

const clientEntries = [...sources.keys()].filter(
  (file) => directive(sources.get(file)!) === "client"
);

/** Every module actually bundled with a client component. */
const bundled = new Map<string, string>();
for (const entry of clientEntries) {
  const stack = [entry];
  const seen = new Set<string>();

  while (stack.length) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);

    // See note 2.
    if (current !== entry && directive(sources.get(current) ?? "") === "server") {
      continue;
    }

    if (!bundled.has(current)) bundled.set(current, entry);
    for (const next of importsOf(current)) {
      if (!seen.has(next)) stack.push(next);
    }
  }
}

describe("the scan itself", () => {
  it("finds client components, so a broken walk is not a pass", () => {
    expect(clientEntries.length).toBeGreaterThan(100);
  });

  it("reaches modules beyond the entry files, so the graph is being followed", () => {
    // If import resolution broke, every helper would be invisible and the
    // assertions below would pass on anything.
    expect(bundled.size).toBeGreaterThan(clientEntries.length);
  });

  it("still recognises a database call when it sees one", () => {
    // The detector, tested on the shape it looks for, so a regex that stopped
    // matching cannot read as a clean codebase.
    expect(databaseCalls(`supabase.from("posts").select("id")`)).toEqual([
      'from("posts")',
    ]);
    expect(databaseCalls(`supabase.rpc("get_my_profile_private")`)).toEqual([
      'rpc("get_my_profile_private")',
    ]);
  });

  it("does not count Supabase Storage as a database call", () => {
    // The avatar uploader reads a bucket this way, and it is allowed.
    expect(databaseCalls(`supabase.storage.from("avatars").upload(path)`)).toEqual(
      []
    );
  });
});

describe("browser database access", () => {
  it("is zero across everything bundled with a client component", () => {
    const offenders: string[] = [];

    for (const [file, entry] of bundled) {
      const calls = databaseCalls(sources.get(file)!);
      if (calls.length === 0) continue;
      offenders.push(
        `${file}${file === entry ? "" : ` (via ${entry})`}: ${[
          ...new Set(calls),
        ].join(", ")}`
      );
    }

    // RLS is what made every one of these safe, and it has no successor: after
    // the migration there is no key a browser can hold, because a connection
    // string is not a public credential.
    expect(offenders.sort()).toEqual([]);
  });

  it("pulls no server-only module into the browser bundle", () => {
    const leaks: string[] = [];
    for (const [file, entry] of bundled) {
      if (/^\s*import\s+["']server-only["']/m.test(sources.get(file)!)) {
        leaks.push(`${file} via ${entry}`);
      }
    }

    // The build enforces this too, and disagreeing with the build would mean
    // one of them is wrong about what gets bundled.
    expect(leaks.sort()).toEqual([]);
  });

  it("imports no PostgreSQL driver from browser code", () => {
    const drivers: string[] = [];
    for (const [file, entry] of bundled) {
      const source = strip(sources.get(file)!);
      if (/from\s+["'](postgres|pg)["']/.test(source)) {
        drivers.push(`${file} via ${entry}`);
      }
      if (/process\.env\.DATABASE_URL/.test(source)) {
        drivers.push(`${file} via ${entry} (DATABASE_URL)`);
      }
    }
    expect(drivers.sort()).toEqual([]);
  });

  it("uses no service-role key from browser code", () => {
    const elevated: string[] = [];
    for (const [file, entry] of bundled) {
      const source = strip(sources.get(file)!);
      if (/SERVICE_ROLE/.test(source)) elevated.push(`${file} via ${entry}`);
    }
    expect(elevated.sort()).toEqual([]);
  });
});
