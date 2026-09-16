import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTIFICATION_DESCRIPTORS } from "./notificationCatalog";

/**
 * Follow is the only relationship between two members.
 *
 * The publishing reset, Phase 2H, removed author subscriptions, topic
 * subscriptions, the subscription UX V2 drawer and nudges, the /subscriptions
 * manager, and the publication delivery they fed: the delivery worker and its
 * recovery cron route, tracked delivery links, subscription notifications and
 * the email and push settings for them. Their tables stay in the database
 * until the cleanup phase; nothing in the application reads or writes them.
 *
 * This scans application code only (app, components, lib, proxy.ts), with
 * comments stripped and tests excluded, the same way
 * lib/retiredResponseProduct.test.ts does. Historical SQL migrations are
 * deliberately not scanned: they describe what the database once had.
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

const RETIRED_PATHS = [
  "components/profile/AuthorRelationshipControls.tsx",
  "components/profile/AuthorRelationshipControlsV2.tsx",
  "components/profile/AuthorRelationshipProvider.tsx",
  "components/topic",
  "app/(main)/subscriptions",
  "app/(main)/settings/SubscribedAuthorsManager.tsx",
  "app/(main)/settings/SubscribedTopicsManager.tsx",
  "lib/publicationDelivery.ts",
  "lib/publicationDistribution.ts",
  "app/api/cron/process-publication-deliveries",
  "app/r/p",
];

describe("follow-only relationship: the subscription code is gone", () => {
  it.each(RETIRED_PATHS)("has no %s", (path) => {
    expect(existsSync(join(ROOT, path))).toBe(false);
  });

  it("reads and writes none of the subscription or delivery tables", () => {
    expect(
      filesMatching(
        /\b(?:author_subscriptions|author_subscription_events|topic_subscriptions|publication_events|publication_deliveries)\b/
      )
    ).toEqual([]);
  });

  it("calls none of the relationship, subscription or delivery functions", () => {
    expect(
      filesMatching(
        /\b(?:set_author_relationship(?:_v2)?|set_topic_subscription|list_my_author_subscriptions|list_my_topic_subscriptions|get_subscription_feed_candidates|claim_publication_[a-z_]+|renew_publication_[a-z_]+)\b/
      )
    ).toEqual([]);
  });

  it("has no subscription release gate", () => {
    expect(
      filesMatching(
        /NEXT_PUBLIC_(?:AUTHOR|TOPIC)_SUBSCRIPTIONS|\bis(?:AuthorSubscriptions(?:UxV2)?|TopicSubscriptions)Enabled\b/
      )
    ).toEqual([]);
  });

  it("offers no subscribe control, manager or delivery setting", () => {
    expect(
      filesMatching(
        /\b(?:setAuthorSubscription|TopicSubscribeButton|SubscribedAuthorsManager|SubscribedTopicsManager|offerQualifiedReadNudge|useAuthorRelationship|email_author_publications|push_author_publications|schedulePublicationDistribution|processPendingPublicationEvents)\b/
      )
    ).toEqual([]);
    expect(filesMatching(/["'`>]\s*(?:Subscribe|Subscribed|Unsubscribe from author|Manage subscriptions|Publication subscriptions)\b/)).toEqual([]);
    expect(filesMatching(/href=["'{`]*\/subscriptions\b/)).toEqual([]);
  });

  it("records no subscription analytics event", () => {
    expect(filesMatching(/"author_subscription_[a-z_]+"/)).toEqual([]);
    expect(codeOf("lib/activationEvents.ts")).toContain('| "writer_followed"');
  });

  it("files no notification under subscriptions", () => {
    for (const [type, descriptor] of Object.entries(NOTIFICATION_DESCRIPTORS)) {
      expect(descriptor.category, type).not.toBe("subscriptions");
    }
  });
});

describe("follow-only relationship: one Follow control", () => {
  it("toggles a follow from exactly one component", () => {
    expect(filesMatching(/\btoggleFollow\s*\(/, { "components/ui/followActions.ts": "Defines it." })).toEqual([
      "components/ui/FollowButton.tsx",
    ]);
  });

  it("renders that control wherever a reader can follow a writer", () => {
    for (const file of [
      "components/profile/ProfileHeader.tsx",
      "app/(main)/post/[slug]/page.tsx",
      "app/(main)/post/[slug]/AuthorBioCard.tsx",
      "app/(main)/post/[slug]/PostConversationView.tsx",
      "app/(main)/explore/page.tsx",
    ]) {
      expect(codeOf(file), file).toMatch(/<FollowButton\b/);
    }
  });

  it("says only Follow and Following", () => {
    const button = codeOf("components/ui/FollowButton.tsx");
    expect(button).toContain('"Following"');
    expect(button).toContain('"Follow"');
    expect(button).not.toMatch(/subscri|bell|drawer|nudge/i);
  });

  it("writes the follows table and nothing else", () => {
    const actions = codeOf("components/ui/followActions.ts");
    expect(actions).toContain('.from("follows")');
    expect(actions).not.toMatch(/\.rpc\(/);
    const tables = [...actions.matchAll(/\.from\("([a-z_]+)"\)/g)].map((match) => match[1]);
    // profiles and notifications are the after-response follow notification.
    expect(new Set(tables)).toEqual(new Set(["follows", "profiles", "notifications"]));
    expect(actions).toContain("isBlockedPair");
  });

  it("asks nobody's subscription state when a profile or a post loads", () => {
    for (const file of ["lib/profileViewData.ts", "lib/db/profilePage.ts", "lib/db/postPage.ts"]) {
      expect(codeOf(file), file).not.toMatch(/subscri/i);
    }
  });
});

describe("follow-only relationship: old addresses still go somewhere", () => {
  const nextConfig = readFileSync(join(ROOT, "next.config.mjs"), "utf8");

  it("sends /subscriptions to Explore, permanently", () => {
    expect(nextConfig).toMatch(/\["\/subscriptions", "\/leaderboard"\]\.map\(\(source\) => \(\{\s*source,\s*destination: "\/explore",\s*permanent: true/);
  });

  it("sends a tracked delivery link already sent to Home", () => {
    expect(nextConfig).toContain('{ source: "/r/p/:token", destination: "/", permanent: true }');
  });

  it("keeps /subscriptions reserved, so no member can claim it", () => {
    expect(codeOf("lib/profileUsername.ts")).toContain('"subscriptions"');
  });
});
