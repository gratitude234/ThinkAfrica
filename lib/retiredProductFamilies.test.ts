import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";
import { PROFILE_SETTINGS_SECTIONS } from "@/lib/profileSettings";
import { NOTIFICATION_DESCRIPTORS } from "@/lib/notificationCatalog";
import { RESERVED_PROFILE_PATHS } from "@/lib/profileUsername";
import * as featureFlags from "@/lib/featureFlags";

/**
 * The product families Phase 2D removed stay removed.
 *
 * Opportunities and Fellowships, Talent, Campus, Ambassadors, Alumni, Partners,
 * the Policy Hub and the sponsor system were application products. Their
 * routes, actions, components, repository methods, analytics events,
 * notification types and navigation are gone, and their old addresses
 * redirect. Their tables are still in the database, deliberately: dropping
 * them is a later phase, once nothing reads them.
 *
 * This guards the application, not the schema. It reads no migration file, so
 * historical SQL that still creates or grants on these tables is not a
 * regression, and neither is prose: comments are stripped before matching, the
 * same way lib/postWriteBoundary.test.ts does it, because the code that remains
 * describes the removal.
 */

const ROOTS = ["app", "components", "lib"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
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

const sources = ROOTS.flatMap(sourceFiles).map((file) => ({
  file: relative(process.cwd(), file).split(sep).join("/"),
  code: withoutComments(readFileSync(file, "utf8")),
}));

function filesMatching(pattern: RegExp) {
  return sources.filter(({ code }) => pattern.test(code)).map(({ file }) => file);
}

/** Public routes, and where each old address now sends a reader. */
const RETIRED_ROUTES: Array<[string, string]> = [
  ["/opportunities", "/explore"],
  ["/fellowships", "/explore"],
  ["/talent", "/explore"],
  ["/campus", "/explore"],
  ["/ambassadors", "/explore"],
  ["/alumni", "/explore"],
  ["/policy", "/explore"],
  ["/partners", "/about"],
];

const RETIRED_ADMIN_ROUTES = [
  "/admin/fellowships",
  "/admin/campuses",
  "/admin/ambassadors",
  "/admin/partners",
  "/admin/sponsors",
];

const RETIRED_DIRECTORIES = [
  ...RETIRED_ROUTES.map(([route]) => `app/(main)${route}`),
  ...RETIRED_ADMIN_ROUTES.map((route) => `app/(main)${route}`),
  "app/api/partner-contact",
  "components/opportunities",
];

const RETIRED_MODULES = [
  "lib/opportunities.ts",
  "lib/opportunityMatch.ts",
  "lib/opportunityReadiness.ts",
  "lib/talentDiscovery.ts",
  "lib/applicationReview.ts",
  "lib/campus.ts",
  "lib/contactRequests.ts",
  "lib/credibilityGraph.ts",
  "lib/credibilityGraphData.ts",
  "lib/profileCredibility.ts",
  "lib/demonstratedExpertise.ts",
  "lib/rateLimit.ts",
  "components/ui/SponsorBanner.tsx",
  "components/profile/ContactInquiryModal.tsx",
  "components/profile/opportunityInquiryActions.ts",
  "app/(main)/dashboard/opportunityInquiryActions.ts",
  "app/(main)/explore/MobileOpportunitiesBanner.tsx",
  "app/(main)/settings/profile/outcomeActions.ts",
  "app/(main)/settings/profile/sections/OpportunitiesSection.tsx",
  "app/(main)/settings/profile/sections/OutcomesSection.tsx",
];

/** Tables only the retired products read or wrote. Still in the database. */
const RETIRED_TABLES = [
  "fellowships",
  "fellowship_applications",
  "saved_opportunities",
  "opportunity_outcomes",
  "opportunity_outcome_events",
  "talent_profiles",
  "talent_inquiries",
  "campus_programs",
  "campus_cohorts",
  "campus_cohort_memberships",
  "campus_editorial_prompts",
  "campus_prompt_submissions",
  "campus_ambassadors",
  "campus_ambassador_activity",
  "institutional_partners",
  "sponsor_placements",
  "contact_requests",
  "policy_briefs_featured",
];

describe("retired product families: the code is gone", () => {
  it.each(RETIRED_DIRECTORIES)("has no %s", (directory) => {
    expect(existsSync(join(process.cwd(), directory))).toBe(false);
  });

  it.each(RETIRED_MODULES)("has no %s", (module) => {
    expect(existsSync(join(process.cwd(), module))).toBe(false);
  });

  it("imports none of the retired modules", () => {
    const names = RETIRED_MODULES.map((module) =>
      module.replace(/\.(ts|tsx)$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    const pattern = new RegExp(
      `from\\s+["'](?:@/)?(?:${names.join("|")})["']|from\\s+["']@/components/opportunities/`
    );
    expect(filesMatching(pattern)).toEqual([]);
  });
});

describe("retired product families: nothing points at them", () => {
  it("links to no retired route", () => {
    const routes = [...RETIRED_ROUTES.map(([route]) => route), ...RETIRED_ADMIN_ROUTES]
      .map((route) => route.replace(/\//g, "\\/"))
      .join("|");
    // A string or template literal that starts with the route and ends there,
    // or continues into a path, query or fragment.
    const pattern = new RegExp(`["'\`](?:${routes})(?:["'\`/?#$])`);
    expect(filesMatching(pattern)).toEqual([]);
  });

  it("reads and writes none of their tables", () => {
    const tables = RETIRED_TABLES.join("|");
    const postgrest = new RegExp(`\\.from\\(\\s*["'](?:${tables})["']`);
    const sql = new RegExp(`\\bpublic\\.(?:${tables})\\b`);
    expect(filesMatching(postgrest)).toEqual([]);
    expect(filesMatching(sql)).toEqual([]);
  });

  it("offers no retired profile section", () => {
    expect(PROFILE_SETTINGS_SECTIONS as readonly string[]).not.toContain("opportunities");
    expect(PROFILE_SETTINGS_SECTIONS as readonly string[]).not.toContain("outcomes");
  });

  it("describes no retired notification and files nothing under Opportunities", () => {
    expect(NOTIFICATION_DESCRIPTORS).not.toHaveProperty("fellowship");
    expect(NOTIFICATION_DESCRIPTORS).not.toHaveProperty("opportunity_inquiry");
    for (const descriptor of Object.values(NOTIFICATION_DESCRIPTORS)) {
      expect(descriptor.category as string).not.toBe("opportunities");
    }
  });

  it("keeps no section switch for the products it used to hide", () => {
    expect("FEATURE_FLAGS" in featureFlags).toBe(false);
    expect("isEnabled" in featureFlags).toBe(false);
  });

  it("records none of their analytics events", () => {
    const events = readFileSync(join(process.cwd(), "lib/activationEvents.ts"), "utf8");
    const route = readFileSync(join(process.cwd(), "app/api/activation/route.ts"), "utf8");
    const retired = /"(?:opportunity_[a-z_]+|fellowship_[a-z_]+|campus_hub_viewed|ambassador_[a-z_]+|profile_inquiry_[a-z_]+)"/;
    expect(withoutComments(events)).not.toMatch(retired);
    expect(withoutComments(route)).not.toMatch(retired);
  });

  it("grants no admin capability and lists no admin area for them", () => {
    const access = withoutComments(readFileSync(join(process.cwd(), "lib/adminAccess.ts"), "utf8"));
    for (const capability of [
      "opportunities.manage",
      "partners.manage",
      "sponsors.manage",
      "ambassadors.manage",
    ]) {
      expect(access).not.toContain(capability);
    }
  });
});

describe("retired product families: old addresses still go somewhere", () => {
  type Redirect = { source: string; destination: string; permanent: boolean };

  async function redirects(): Promise<Redirect[]> {
    return (await nextConfig.redirects?.()) ?? [];
  }

  it.each(RETIRED_ROUTES)("redirects %s to %s, permanently", async (route, destination) => {
    const match = (await redirects()).find((entry) => entry.source === route);
    expect(match, route).toBeDefined();
    expect(match!.destination).toBe(destination);
    expect(match!.permanent).toBe(true);
  });

  it("redirects the detail pages under the two products that had them", async () => {
    const sources = (await redirects()).map((entry) => entry.source);
    expect(sources).toContain("/fellowships/:path*");
    expect(sources).toContain("/ambassadors/:path*");
  });

  it.each(RETIRED_ADMIN_ROUTES)("redirects %s to the admin hub", async (route) => {
    const match = (await redirects()).find((entry) => entry.source === route);
    expect(match, route).toBeDefined();
    expect(match!.destination).toBe("/admin");
  });

  it("does not answer a retired address with a placeholder page", () => {
    for (const [route] of RETIRED_ROUTES) {
      for (const file of ["page.tsx", "route.ts"]) {
        expect(existsSync(join(process.cwd(), "app", "(main)", route, file))).toBe(false);
        expect(existsSync(join(process.cwd(), "app", "(marketing)", route, file))).toBe(false);
      }
    }
  });

  it("keeps every retired segment reserved, so no member can claim one", () => {
    for (const [route] of RETIRED_ROUTES) {
      expect(RESERVED_PROFILE_PATHS.has(route.slice(1)), route).toBe(true);
    }
  });
});
