import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Two rules about `"use server"` modules that Next enforces at build time and
 * nothing enforces before it.
 *
 * The first cost a build during Phase 2: a helper exported from an actions file
 * for a test to use, which is a compile error rather than a runtime one and so
 * survived typecheck, lint and 2,300 unit tests. A four-minute build is a slow
 * way to learn it.
 *
 * The second is not a Next rule at all, it is the Phase 2 security rule:
 * **every export of a `"use server"` module is a callable endpoint**, reachable
 * by anyone who can post to the action id. So the shape of what those modules
 * export is worth asserting for its own sake.
 */

const ROOTS = ["app", "components", "lib"];
const REPO = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const serverActionFiles = ROOTS.flatMap((root) => walk(join(REPO, root)))
  .map((absolute) => ({
    path: relative(REPO, absolute).split(sep).join("/"),
    source: readFileSync(absolute, "utf8"),
  }))
  .filter((file) => /^\s*["']use server["']/m.test(file.source));

describe('"use server" modules', () => {
  it("are found, so a broken scan is not a pass", () => {
    expect(serverActionFiles.length).toBeGreaterThan(30);
  });

  it("export only async functions and types", () => {
    // Next refuses to build otherwise, and the message points at the export
    // rather than at the reason: everything a "use server" module exports
    // becomes a remotely callable endpoint, so a synchronous helper cannot be
    // one.
    const offenders: string[] = [];

    for (const file of serverActionFiles) {
      const exports = file.source.matchAll(
        /^export\s+(?!type\b|interface\b|default\b|\{)(\w+)\s+(\w+)/gm
      );
      for (const match of exports) {
        const [, keyword, name] = match;
        if (keyword === "async") continue;
        // `export const X = ...` and `export function f()` are both refused;
        // only `export async function` and type-only exports are allowed.
        offenders.push(`${file.path}: export ${keyword} ${name}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("never take an actor id as an argument", () => {
    // The Phase 2 rule, applied to every actions module rather than only the
    // ones Phase 2 wrote. An argument is something a browser can choose, and
    // RLS is what currently makes a forged one harmless.
    //
    // The three exceptions are named because they are not actor ids: they
    // identify the *other* party in a two-party operation, and each one is
    // authorized against the session on the server.
    const ALLOWED = new Map([
      ["components/ui/followActions.ts", ["followingId", "authorId"]],
      ["app/(main)/[username]/actions.ts", ["authorId"]],
      ["components/profile/opportunityInquiryActions.ts", ["talentUserId"]],
      ["app/(main)/dashboard/opportunityInquiryActions.ts", ["talentUserId"]],
      // An admin verifying or suspending somebody names that somebody. The
      // acting admin is still resolved from the session, by requireCapability.
      ["app/(main)/admin/verification/actions.ts", ["userId"]],
      ["app/(main)/admin/moderation/actions.ts", ["userId"]],
    ]);

    /** The parameter list only. A body would match `context.userId`, which is
     *  the opposite of the problem: an id the server resolved itself. */
    function parameterLists(source: string): string[] {
      const lists: string[] = [];
      const header = /export async function \w+\s*\(/g;
      let match: RegExpExecArray | null;
      while ((match = header.exec(source))) {
        let depth = 1;
        let index = match.index + match[0].length;
        while (index < source.length && depth > 0) {
          if (source[index] === "(") depth += 1;
          else if (source[index] === ")") depth -= 1;
          index += 1;
        }
        lists.push(source.slice(match.index + match[0].length, index - 1));
      }
      return lists;
    }

    /** An inline `{ ... }` parameter type is the whole signature; a named one
     *  has to be followed into its declaration. */
    function namedInputTypes(source: string, list: string): string[] {
      const named = list.match(/:\s*([A-Z]\w+)/g) ?? [];
      return named
        .map((entry) => entry.replace(/^:\s*/, ""))
        .map((name) => {
          const declaration = source.match(
            new RegExp(`(?:export )?interface ${name} \\{[\\s\\S]*?\\n\\}`)
          );
          return declaration?.[0] ?? "";
        });
    }

    const offenders: string[] = [];
    const ACTOR_ID =
      /\b(userId|profileId|ownerId|actorId|viewerId|currentUserId|senderId)\b/;

    for (const file of serverActionFiles) {
      for (const list of parameterLists(file.source)) {
        for (const text of [list, ...namedInputTypes(file.source, list)]) {
          const found = text.match(ACTOR_ID);
          if (!found) continue;
          if (ALLOWED.get(file.path)?.includes(found[1])) continue;
          offenders.push(`${file.path}: ${found[1]}`);
        }
      }
    }

    expect([...new Set(offenders)]).toEqual([]);
  });
});
