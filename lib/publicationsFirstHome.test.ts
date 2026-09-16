import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";

/**
 * Home stays a publication feed.
 *
 * The publishing reset, Phase 2F, took Home from a dashboard to a feed. It
 * removed the sidebar Intellectual Brief, the featured lead, the people and
 * topic interludes, the welcome and push-permission banners, the activation
 * and retention cards, the Latest, Subscribed and Topics tabs, the Daily Brief,
 * the Featured Posts and digest admin tools, and the feed ranking's retired
 * signals. It also cut Home's reads from nine parallel queries to the three in
 * lib/feedViewer.ts plus one page of the feed.
 *
 * This guards the application only. It reads no SQL migration, and comments
 * are stripped before matching, the same way lib/retiredMessaging.test.ts does
 * it, because the code that remains describes the removal in prose.
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
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix) => prefix + " ".repeat(match.length - prefix.length))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (block) => block.replace(/[^\n]/g, " "));
}

const sources = ROOTS.flatMap(sourceFiles).map((file) => ({
  file: relative(process.cwd(), file).split(sep).join("/"),
  code: withoutComments(readFileSync(file, "utf8")),
}));

function codeOf(file: string) {
  const found = sources.find((source) => source.file === file);
  if (!found) throw new Error(`${file} is not an application source file`);
  return found.code;
}

function filesMatching(pattern: RegExp, allowed: Record<string, string> = {}) {
  return sources
    .filter(({ file, code }) => !(file in allowed) && pattern.test(code))
    .map(({ file }) => file);
}

function importsOf(code: string) {
  return [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]).sort();
}

const RETIRED_PATHS = [
  "components/ui/HomeSidebar.tsx",
  "components/ui/BriefColumn.tsx",
  "components/post/HomeFeaturedLead.tsx",
  "components/post/HomeFeaturedLeadImpression.tsx",
  "components/post/PeopleInterlude.tsx",
  "components/post/TopicInterlude.tsx",
  "components/ui/WelcomeBanner.tsx",
  "components/push/PushPromptBanner.tsx",
  "components/push/usePushNudge.ts",
  "lib/pushPromptPolicy.ts",
  "lib/pushNudgeStorage.ts",
  "components/retention/RetentionThisWeek.tsx",
  "components/retention/TrackedActionLink.tsx",
  "components/ui/ActivationBanner.tsx",
  "components/notifications/ActionInboxPanel.tsx",
  "lib/activation.ts",
  "lib/retention.ts",
  "lib/profileNextAction.ts",
  "lib/dailyBrief.ts",
  "lib/readerSignals.ts",
  "app/api/cron/daily-brief",
  "app/(main)/admin/review",
  "app/(main)/admin/digest",
  "app/(main)/admin/analytics/ProfileReminderButton.tsx",
  "app/(main)/dashboard/QualitySignals.tsx",
  "app/(main)/dashboard/PortfolioProgressCard.tsx",
  "app/(main)/ContinueDraftRow.tsx",
];

describe("publications-first Home: the retired modules are gone", () => {
  it.each(RETIRED_PATHS)("has no %s", (path) => {
    expect(existsSync(join(process.cwd(), path))).toBe(false);
  });

  it("renders no sidebar brief, featured lead, interlude, banner or retention card", () => {
    expect(
      filesMatching(
        /\b(?:HomeSidebar|BriefColumn|HomeFeaturedLead(?:Impression)?|PeopleInterlude|WelcomeBanner|PushPromptBanner|usePushNudge|RetentionThisWeek|TrackedActionLink|ActivationBanner|ActionInboxPanel|PortfolioProgressCard|QualitySignals|ContinueDraftRow|ProfileReminderButton|DigestSendButton|FeaturePostButton)\b/
      )
    ).toEqual([]);
  });

  it("inserts nothing but publications into Home's list", () => {
    // Explore keeps its own topic shelf, which is discovery rather than an
    // interruption of reading. Nothing imports the Home interlude.
    expect(filesMatching(/components\/post\/TopicInterlude|["']\.\/TopicInterlude["']/)).toEqual([]);
    expect(codeOf("components/post/PostFeed.tsx")).not.toMatch(
      /Interlude|getDiscoveryModule|peopleSuggestions|\[\s*3\s*,\s*7\s*,\s*11\s*\]/
    );
    expect(codeOf("app/(main)/PostsFeedTabs.tsx")).not.toMatch(
      /peopleSuggestions|featuredPost|getSuggestedPeople/
    );
  });

  it("uses no Intellectual Brief, featured-today or editor's-pick language", () => {
    expect(
      filesMatching(/intellectual brief|Featured today|Editor(?:'|’|&apos;)s pick/i)
    ).toEqual([]);
  });

  it("computes no activation checklist, retention summary or next action", () => {
    expect(
      filesMatching(
        /\b(?:getActivationState|getRetentionSummary|getProfileNextAction|withNextAction|trackNextActionClicked|getSuggestedPeople)\b/,
        {
          "lib/discoverData.ts": "Explore's People tab suggests writers; that is discovery, not a Home nudge.",
          "lib/suggestedPeople.ts": "The suggestion query Explore's People tab reads.",
        }
      )
    ).toEqual([]);
  });

  it("records no activation event for a retired product or nudge", () => {
    const vocabulary = codeOf("lib/activationEvents.ts");
    const route = codeOf("app/api/activation/route.ts");
    const retired =
      /"(?:home_tab_changed|weekly_digest_previewed|quality_check_[a-z_]+|research_[a-z_]+|push_nudge_[a-z_]+|profile_next_action_clicked|draft_started|publish_drawer_opened|reference_added|profile_brief_created|profile_brief_revoked)"/;
    expect(vocabulary).not.toMatch(retired);
    expect(route).not.toMatch(retired);
  });
});

describe("publications-first Home: the retired systems stay retired", () => {
  it("runs no Daily Brief", () => {
    expect(
      filesMatching(
        /\bpush_daily_brief\b|\/api\/cron\/daily-brief|\bDAILY_BRIEF_DRY_RUN\b|\b(?:getDailyBriefContent|getDailyBriefPushRecipients|broadcastPushNotification)\b/
      )
    ).toEqual([]);
  });

  it("reads and writes no posts.featured", () => {
    expect(
      filesMatching(
        /\.(?:eq|order)\(\s*["']featured["']|\bfeatured_provenance\b|\b(?:featurePostExclusively|setPostFeatured|clearFeatured|createFeaturedExposure|getFeaturedPostCandidates|uniqueFeaturedPosts)\b/
      )
    ).toEqual([]);
    // The landing page's data module went in the final UI simplification; the
    // page that remains must not have picked the featured read back up.
    expect(existsSync(join(process.cwd(), "app/(marketing)/landing/landingData.ts"))).toBe(false);
    expect(codeOf("app/(marketing)/landing/page.tsx")).not.toMatch(/\bfeatured\b/);
  });

  it("asks for push permission nowhere but Settings", () => {
    expect(
      filesMatching(/\bpush_prompt_(?:shown_at|last_shown_at|attempt_count)\b/, {
        "lib/profilePrivilegeGuard.ts":
          "Keeps the retired columns protected from client writes until they are dropped.",
      })
    ).toEqual([]);
    expect(filesMatching(/\bpushPromptPolicy\b|\bpushNudgeStorage\b|\bNudgeState\b/)).toEqual([]);
  });

  it("records no activity fact on navigation", () => {
    expect(filesMatching(/record_user_activity_day|user_activity_days/)).toEqual([]);
  });

  it("sends the Featured Posts and digest admin addresses to the admin hub", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    for (const source of ["/admin/review", "/admin/digest"]) {
      const match = redirects.find((entry) => entry.source === source);
      expect(match, source).toMatchObject({ destination: "/admin", permanent: true });
    }
    expect(codeOf("lib/adminAccess.ts")).not.toMatch(
      /\/admin\/review|\/admin\/digest|editorial\.manage|digest\.manage/
    );
  });
});

describe("publications-first Home: two feed modes", () => {
  it("names no third Home mode anywhere in the feed path", () => {
    for (const file of [
      "app/(main)/page.tsx",
      "app/(main)/PostsFeedSection.tsx",
      "app/(main)/PostsFeedTabs.tsx",
      "app/api/feed/route.ts",
      "lib/feedData.ts",
      "lib/feedExposure.ts",
      "lib/homeFeedTabs.ts",
      "components/post/PostFeed.tsx",
      "components/post/HomeFeedCardImpression.tsx",
    ]) {
      expect(codeOf(file), file).not.toMatch(
        /["'](?:latest|subscriptions|topics|featured|citable|home_featured)["']|["'](?:Latest|Subscribed|Topics|Discover)["']/
      );
    }
  });
});

describe("publications-first Home: what Home reads", () => {
  it("reads nothing on the Home page itself but the session", () => {
    const page = codeOf("app/(main)/page.tsx");
    expect(page).not.toMatch(/\.from\(|\.rpc\(/);
    // A new import on Home is a new thing on Home. Add it here on purpose.
    expect(importsOf(page)).toEqual(
      [
        "react",
        "next",
        "next/navigation",
        "@/lib/supabase/server",
        "@/components/post/FeedSkeleton",
        "@/components/retention/RetentionEventTracker",
        "./PostsFeedSection",
        "@/lib/site",
        "@/lib/brand",
      ].sort()
    );
  });

  it("loads the feed through the three viewer reads and one page of the feed", () => {
    const section = codeOf("app/(main)/PostsFeedSection.tsx");
    expect(section).not.toMatch(/\.from\(|\.rpc\(/);
    expect(section).toContain("loadFeedViewer(");
    expect(section).toContain("fetchFeedPage(");

    const route = codeOf("app/api/feed/route.ts");
    expect(route).not.toMatch(/\.from\(|\.rpc\(/);
    expect(route).toContain("loadFeedViewer(");

    const viewer = codeOf("lib/feedViewer.ts");
    expect(viewer.match(/\.from\(/g) ?? []).toHaveLength(2);
    expect(viewer).not.toMatch(/\.rpc\(/);

    const layout = codeOf("app/(main)/layout.tsx");
    expect(layout.match(/\.from\(/g) ?? []).toHaveLength(1);
    expect(layout).not.toMatch(/\.rpc\(/);
  });

  it("ranks on relevance, engagement and freshness, with no retired signal", () => {
    const retired =
      /citation_id|published_version_id|isFormallyReviewed|university|co_?authors?|coAuthor|reference_?count|referenceCount|\bfeatured\b|evergreen|well_read|requireCitation|reader_affinity|viewer_post_engagement|readerSignals|fatigue|subscription|quality_?score|surface_reason|quality_badges/i;
    for (const file of [
      "lib/feedRanking.ts",
      "lib/feedData.ts",
      "lib/feedExposure.ts",
      "lib/db/feedList.ts",
    ]) {
      expect(codeOf(file), file).not.toMatch(retired);
    }
    expect(codeOf("lib/db/feed.ts")).not.toMatch(/reference_?count|referenceCount|co_?authors?|coAuthor/i);
  });

  it("puts no retired metadata on a publication card", () => {
    for (const file of ["components/post/HomeFeedCard.tsx", "components/post/PostCard.tsx"]) {
      expect(codeOf(file), file).not.toMatch(
        /surface_reason|quality_badges|quality_score|co_authors|subscription_match|Why surfaced|Co-author/
      );
    }
    expect(codeOf("components/post/HomeFeedCard.tsx")).not.toMatch(/university/);
  });
});

describe("publications-first Home: the writer's dashboard", () => {
  it("is retired, and sends the writer to their profile, where Drafts live", () => {
    // The final UI simplification replaced the dashboard with the owner's
    // Drafts tab. The address stays, as a redirect, so old links still land.
    const dashboard = codeOf("app/(main)/dashboard/page.tsx");
    expect(importsOf(dashboard)).toEqual(
      ["next/navigation", "@/lib/profileUsername", "@/lib/supabase/server"].sort()
    );
    // A temporary (307) redirect: the destination is per account, and a
    // permanent one could be cached by the browser across sign-ins.
    expect(dashboard).toMatch(/\bredirect\(username \? `\/\$\{username\}` : "\/settings\/profile"\)/);
    expect(dashboard).not.toMatch(/permanentRedirect/);
    const me = codeOf("app/(main)/me/page.tsx");
    expect(me).toMatch(/\bredirect\(username \? `\/\$\{username\}` : "\/settings\/profile"\)/);
    expect(me).not.toMatch(/permanentRedirect/);
    expect(dashboard).not.toMatch(/myProfile|featuredWorkCount|unreadNotifications|engagementHistory|StatsBar|PostsTable/);
    for (const retired of ["StatsBar.tsx", "PostsTable.tsx", "loading.tsx"]) {
      expect(existsSync(join(process.cwd(), "app/(main)/dashboard", retired)), retired).toBe(false);
    }
  });
});
