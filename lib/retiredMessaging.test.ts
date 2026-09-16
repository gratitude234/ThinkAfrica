import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config.mjs";
import {
  RETIRED_PRIVACY_SETTING_KEYS,
  retainedPrivacySettings,
} from "@/lib/profilePrivate";
import { RESERVED_PROFILE_PATHS } from "@/lib/profileUsername";

vi.mock("server-only", () => ({}));

const { MIGRATABLE_READ_DOMAINS, RETIRED_READ_DOMAINS, resolveMigratedReadDomains } =
  await import("@/lib/db/readAdapter");

/**
 * Direct messaging stays removed.
 *
 * Phase 2E deleted the product: the `/messages` pages and their server
 * actions, the message APIs, the profile Message button, message eligibility,
 * the messaging repository, message email and push, the "who can start a
 * conversation" setting and the messaging analytics. Old message links
 * redirect to Notifications.
 *
 * The data is not gone, deliberately. `conversations`,
 * `conversation_participants` and `messages` keep their rows until the
 * database cleanup phase, and 20260915000001_disable_messaging_writes.sql
 * revokes client writes to them. This guards the application only: it reads
 * no migration file, and comments are stripped before matching, the same way
 * lib/postWriteBoundary.test.ts does it, because the code that remains
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

function filesMatching(pattern: RegExp, allowed: Record<string, string> = {}) {
  return sources
    .filter(({ file, code }) => !(file in allowed) && pattern.test(code))
    .map(({ file }) => file);
}

const RETIRED_PATHS = [
  "app/(main)/messages",
  "app/api/messages",
  "lib/conversationActions.ts",
  "lib/messagingEligibility.ts",
  "lib/db/messaging.ts",
];

/**
 * Files allowed to name a retired messaging key, each for a reason that is not
 * a product surface. The list should shrink, never grow.
 */
const ALLOWED_KEY_NAMES: Record<string, string> = {
  "lib/profilePrivate.ts":
    "Names allow_messages as the one retired privacy key a settings save " +
    "carries forward, so saving a profile does not erase stored data.",
};

describe("retired messaging: the code is gone", () => {
  it.each(RETIRED_PATHS)("has no %s", (path) => {
    expect(existsSync(join(process.cwd(), path))).toBe(false);
  });

  it("renders no message thread, conversation list or Message button", () => {
    expect(
      filesMatching(/\b(MessageThread|ConversationListClient|MessageButton)\b/)
    ).toEqual([]);
  });

  it("imports no messaging module and asks nothing about message eligibility", () => {
    expect(
      filesMatching(
        /\b(messagingRepository|MessagingRepository|getMessageEligibility|messagingEligibility|openConversationWith)\b|conversationActions|@\/lib\/db\/messaging/
      )
    ).toEqual([]);
  });

  it("has no path that can open a conversation", () => {
    expect(filesMatching(/find_or_create_conversation/)).toEqual([]);
  });

  it("reads and writes none of the messaging tables", () => {
    const tables = "messages|conversations|conversation_participants";
    expect(filesMatching(new RegExp(`\\.from\\(\\s*["'](?:${tables})["']`))).toEqual([]);
    expect(filesMatching(new RegExp(`\\bpublic\\.(?:${tables})\\b`))).toEqual([]);
  });

  it("links to no messaging page or API", () => {
    expect(filesMatching(/["'`]\/(?:api\/)?messages(?:["'`/?#$])/)).toEqual([]);
  });

  it("records no messaging analytics", () => {
    expect(filesMatching(/["'](?:message_started|message_sent)["']/)).toEqual([]);
  });

  it("offers no message email, message push or conversation privacy setting", () => {
    expect(filesMatching(/\b(?:email_messages|push_messages)\b/)).toEqual([]);
    expect(filesMatching(/\ballow_messages\b|\ballowMessages\b/, ALLOWED_KEY_NAMES)).toEqual([]);
    expect(
      filesMatching(/start a conversation|direct message|New messages|Direct messages/i)
    ).toEqual([]);
  });

  it("suppresses no shell chrome and hides nothing from crawlers for a route that is gone", () => {
    const navRoutes = withoutComments(readFileSync(join(process.cwd(), "app/(main)/navRoutes.ts"), "utf8"));
    const robots = withoutComments(readFileSync(join(process.cwd(), "app/robots.ts"), "utf8"));
    expect(navRoutes).not.toContain("messages");
    expect(robots).not.toContain("/messages");
  });
});

describe("retired messaging: old addresses and old configuration still work", () => {
  type Redirect = { source: string; destination: string; permanent: boolean };

  async function redirects(): Promise<Redirect[]> {
    return (await nextConfig.redirects?.()) ?? [];
  }

  it.each(["/messages", "/messages/:path*"])(
    "redirects %s to Notifications, permanently",
    async (source) => {
      const match = (await redirects()).find((entry) => entry.source === source);
      expect(match, source).toBeDefined();
      expect(match!.destination).toBe("/notifications");
      expect(match!.permanent).toBe(true);
    }
  );

  it("keeps messages reserved, so no member can claim the old route", () => {
    expect(RESERVED_PROFILE_PATHS.has("messages")).toBe(true);
  });

  it("has no messaging read domain, and ignores one left in an environment", () => {
    expect(MIGRATABLE_READ_DOMAINS as readonly string[]).not.toContain("messaging");
    expect(RETIRED_READ_DOMAINS as readonly string[]).toContain("messaging");
    expect([...resolveMigratedReadDomains("messaging,search")]).toEqual(["search"]);
    // A genuine typo is still refused.
    expect(() => resolveMigratedReadDomains("serach")).toThrow(/unknown domain/);
  });
});

describe("retired messaging: stored privacy data survives a settings save", () => {
  it("carries a stored allow_messages value forward, and nothing else", () => {
    expect(RETIRED_PRIVACY_SETTING_KEYS).toEqual(["allow_messages"]);
    expect(
      retainedPrivacySettings({
        allow_messages: "followers_only",
        profile_visibility: "members_only",
        injected: "value",
      })
    ).toEqual({ allow_messages: "followers_only" });
  });

  it("carries nothing when there is nothing valid to carry", () => {
    expect(retainedPrivacySettings(null)).toEqual({});
    expect(retainedPrivacySettings([])).toEqual({});
    expect(retainedPrivacySettings({ allow_messages: true })).toEqual({});
  });
});
