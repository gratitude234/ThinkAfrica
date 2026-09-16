import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTIFICATION_DESCRIPTORS } from "./notificationCatalog";

/**
 * Nothing in the product awards, shows or ranks by points, tiers or badges.
 *
 * The publishing reset, Phase 2H, removed the leaderboard, My Stats, points,
 * contribution tiers and badges from the application, and wrote
 * 20260915000004 to stop the database triggers that awarded them.
 * profiles.points, badges and user_badges keep their rows until the cleanup
 * phase, and nothing in the application reads or writes them. The verified
 * mark is identity verification, not gamification, and stays.
 *
 * This scans application code only (app, components, lib, proxy.ts), with
 * comments stripped and tests excluded. Historical SQL migrations are
 * deliberately not scanned.
 */

const ROOT = process.cwd();
const ROOTS = ["app", "components", "lib"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx|mjs)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix) => prefix + " ".repeat(match.length - prefix.length));
}

const sources = [...ROOTS.flatMap((dir) => sourceFiles(join(ROOT, dir))), join(ROOT, "proxy.ts")].map(
  (file) => ({
    file: relative(ROOT, file).split(sep).join("/"),
    code: withoutComments(readFileSync(file, "utf8")),
  })
);

function codeOf(file: string) {
  const source = sources.find((candidate) => candidate.file === file);
  if (!source) throw new Error(`${file} is not an application source file`);
  return source.code;
}

function filesMatching(pattern: RegExp, allowed: Record<string, string> = {}) {
  return sources
    .filter(({ file, code }) => !(file in allowed) && pattern.test(code))
    .map(({ file }) => file);
}

/**
 * Files allowed to name the points column, each for a reason that is not
 * awarding or showing points. The list should shrink, never grow.
 */
const POINTS_COLUMN_ALLOWED: Record<string, string> = {
  "lib/profileMutations.ts":
    "Lists points among the privileged columns a member may never write to their own profile.",
  "lib/profilePrivilegeGuard.ts":
    "The browser privileged-column guard, which still refuses a write to points.",
};

describe("no gamification: the code is gone", () => {
  it.each([
    "app/(main)/leaderboard",
    "app/(main)/stats",
    "components/ui/PointsTierBadge.tsx",
  ])("has no %s", (path) => {
    expect(existsSync(join(ROOT, path))).toBe(false);
  });

  it("names no points, tier or badge helper", () => {
    expect(
      filesMatching(
        /\b(?:PointsTierBadge|pointsForPost|POST_POINTS|POINT_TIERS|getPointTier|getNextTier|RESPONSE_POINTS|getLeaderboard\w*|leaderboard\w*Repository)\b/
      )
    ).toEqual([]);
  });

  it("reads and writes no badge table", () => {
    expect(filesMatching(/\buser_badges\b|\.from\(\s*["']badges["']\s*\)/)).toEqual([]);
  });

  it("selects, orders and shows no point total", () => {
    expect(
      filesMatching(
        /["'`][^"'`\n]*\b(?:id|username|full_name|university|avatar_url),\s*points\b|\bpoints,\s*(?:avatar_url|verified|interests)\b|\bp\.points\b|\.order\(\s*["']points["']|\.points\b|\bpoints\s*:\s*(?:number|person|row)/,
        POINTS_COLUMN_ALLOWED
      )
    ).toEqual([]);
  });

  it("prints no points, pts, tier or rank copy", () => {
    expect(
      filesMatching(/\bpts\b|points earned|\+\$\{[^}]*\}\s*points|Top [Cc]ontributors|Leaderboard|Contribution tier|\btoLocaleString\(\)\}\s*points/)
    ).toEqual([]);
    expect(filesMatching(/["'`]\/(?:leaderboard|stats)\b/)).toEqual([]);
  });

  it("describes no badge notification", () => {
    expect(NOTIFICATION_DESCRIPTORS.badge).toBeUndefined();
  });
});

describe("no gamification: what replaced it", () => {
  it("suggests people on shared topics and recent publication, not points, school or field", () => {
    for (const file of ["lib/suggestedPeople.ts", "lib/discoverData.ts"]) {
      expect(codeOf(file), file).not.toMatch(/\bpoints\b|\buniversity\b|\bfield_of_study\b/);
    }
  });

  it("returns people in search without a point total", () => {
    expect(codeOf("lib/db/search.ts")).not.toMatch(/\bpoints\b/);
    expect(codeOf("app/(main)/search/page.tsx")).not.toMatch(/\bpoints\b/);
  });

  it("awards nothing when a member publishes, likes, comments or follows", () => {
    for (const file of [
      "app/(write)/write/actions.ts",
      "components/ui/followActions.ts",
      "app/(main)/dashboard/PostsTable.tsx",
    ]) {
      expect(codeOf(file), file).not.toMatch(/\bpoints?\b|\bbadges?\b/i);
    }
  });

  it("keeps the verified mark, which is identity rather than a reward", () => {
    expect(codeOf("components/profile/ProfileHeader.tsx")).toMatch(/function VerifiedMark/);
  });

  it("sends the retired pages somewhere useful, and keeps their names reserved", () => {
    const nextConfig = readFileSync(join(ROOT, "next.config.mjs"), "utf8");
    expect(nextConfig).toContain('["/subscriptions", "/leaderboard"]');
    expect(nextConfig).toContain('{ source: "/stats", destination: "/dashboard", permanent: true }');
    const reserved = codeOf("lib/profileUsername.ts");
    expect(reserved).toContain('"leaderboard"');
    expect(reserved).toContain('"stats"');
  });

  it("protects no retired route in the proxy", () => {
    expect(codeOf("proxy.ts")).not.toContain('"/stats"');
  });
});
