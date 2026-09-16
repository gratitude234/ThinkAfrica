import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("focused publishing product", () => {
  it("keeps the writing dashboard retired", () => {
    const dashboard = source("app/(main)/dashboard/page.tsx");
    const menu = source("app/(main)/NavUserMenu.tsx");
    expect(dashboard).toMatch(/redirect\(/);
    expect(dashboard).not.toMatch(/Published|Drafts|Views|Likes|impressions/i);
    expect(menu).not.toMatch(/Writing dashboard/i);
  });

  it("does not render audio-summary or review/coauthor product UI on publication pages", () => {
    const page = source("app/(main)/post/[slug]/page.tsx");
    const conversation = source("app/(main)/post/[slug]/PostConversationView.tsx");
    const authorCard = source("app/(main)/post/[slug]/AuthorBioCard.tsx");
    expect(page).not.toMatch(/AudioSummaryPlayer|audio_summary_url|post_reviews|HeaderCoAuthors/);
    expect(conversation).not.toMatch(/coAuthors|co-author/i);
    expect(authorCard).not.toMatch(/coAuthors|corresponding_author|co-author/i);
  });

  it("keeps notification settings to current product actions", () => {
    const settings = source("app/(main)/settings/NotificationsForm.tsx");
    expect(settings).not.toMatch(/email_review|email_responses|email_co_author|push_published/);
  });

  it("does not present retired approval or collaboration language", () => {
    const catalog = source("lib/notificationCatalog.ts");
    expect(catalog).not.toMatch(/label:\s*["']Approved["']/);
    expect(catalog).not.toMatch(/invited you to co-author|assigned to review|under review|Review overdue/i);
  });
});
