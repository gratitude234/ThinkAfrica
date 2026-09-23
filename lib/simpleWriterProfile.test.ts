import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";
import { ONBOARDING_STEPS } from "@/lib/onboarding";
import { PROFILE_SETTINGS_SECTIONS } from "@/lib/profileSettings";
import { OWNER_PROFILE_TABS, PROFILE_TABS, PUBLIC_PROFILE_TABS } from "@/lib/profileTabs";

/**
 * A public writer profile, not an Intellectual Record product. Minimal
 * onboarding, not an identity questionnaire.
 *
 * The publishing reset, Phase 2G, replaced the record overview, the full
 * record page, Featured Work, evidence labels, record metrics, the Background
 * rail, the persona taxonomy, the profile Command Center, the four-step
 * onboarding questionnaire, AI topic suggestions and the admin Profile
 * Credibility section with a header and three tabs, a two-step onboarding and
 * a three-section Edit profile.
 *
 * This guards the application only. It reads no SQL migration: the database
 * objects those features used are deferred, not gone. Comments are stripped
 * before matching, the same way lib/publicationsFirstHome.test.ts does it,
 * because the code that remains describes the removal in prose.
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

function filesMatching(
  pattern: RegExp,
  { within = () => true, allowed = {} }: { within?: (file: string) => boolean; allowed?: Record<string, string> } = {}
) {
  return sources
    .filter(({ file, code }) => within(file) && !(file in allowed) && pattern.test(code))
    .map(({ file }) => file);
}

function importsOf(code: string) {
  return [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]).sort();
}

/** The profile, onboarding and profile settings surfaces. */
function isProfileSurface(file: string) {
  return (
    /^(?:app\/\(main\)\/\[username\]\/|components\/profile\/|app\/\(onboarding\)\/|app\/\(main\)\/settings\/profile\/|app\/\(main\)\/me\/)/.test(file) ||
    /^lib\/(?:profile[A-Za-z]*|onboarding[A-Za-z]*)\.ts$/.test(file) ||
    file === "components/ui/ProfileGate.tsx" ||
    file === "app/(main)/settings/page.tsx"
  );
}

const RETIRED_PATHS = [
  "app/(main)/[username]/record",
  "app/(main)/[username]/actions.ts",
  "components/profile/EvidenceLabels.tsx",
  "components/profile/EvidenceLegend.tsx",
  "components/profile/FeaturedWork.tsx",
  "components/profile/FeaturedWorkManager.tsx",
  "components/profile/ProfileBackground.tsx",
  "components/profile/ProfileIdentityPanel.tsx",
  "components/profile/ProfilePreview.tsx",
  "components/profile/ProfileRecordCard.tsx",
  "components/profile/ProfileSectionNav.tsx",
  "components/profile/ProfileStickyBar.tsx",
  "components/profile/ScrollActiveIntoView.tsx",
  "components/ui/IntellectualRecordWelcome.tsx",
  "lib/intellectualRecord.ts",
  "lib/profileRecord.ts",
  "lib/profileRecordData.ts",
  "lib/profileRecordMetrics.ts",
  "lib/profileCommandCenter.ts",
  "lib/profileCommandCenterData.ts",
  "lib/profileOwnerAnalytics.ts",
  "lib/featuredWork.ts",
  "lib/topicSuggestions.ts",
  "lib/geminiTopicSuggestions.ts",
  "lib/profileTypes.ts",
  "lib/db/profileRecord.ts",
  "app/api/topic-suggestions",
  "app/(main)/settings/ProfileForm.tsx",
  "app/(main)/settings/profile/ProfileCommandCenter.tsx",
  "app/(main)/settings/profile/sections/IdentitySection.tsx",
  "app/(main)/settings/profile/sections/FocusSection.tsx",
  "app/(main)/settings/profile/sections/BackgroundSection.tsx",
  "app/(main)/settings/profile/sections/FeaturedWorkSection.tsx",
];

describe("simple writer profile: the retired modules are gone", () => {
  it.each(RETIRED_PATHS)("has no %s", (path) => {
    expect(existsSync(join(process.cwd(), path))).toBe(false);
  });

  it("imports and renders none of them", () => {
    expect(
      filesMatching(
        /\b(?:profileRecord(?:Data|Metrics)?|intellectualRecord|profileCommandCenter(?:Data)?|profileOwnerAnalytics|featuredWork|topicSuggestions|geminiTopicSuggestions|profileTypes|EvidenceLabels|EvidenceLegend|FeaturedWork(?:Manager|Section)?|ProfileBackground|ProfileIdentityPanel|ProfilePreview|ProfileRecordCard|ProfileSectionNav|ProfileStickyBar|IntellectualRecordWelcome|ProfileForm|ProfileCommandCenter|IdentitySection|FocusSection|BackgroundSection)\b/
      )
    ).toEqual([]);
  });

  it("keeps no release gate for a removed profile feature", () => {
    expect(codeOf("lib/featureFlags.ts")).not.toMatch(
      /isProfilePositioningEnabled|isFeaturedWorkNotesEnabled|isAiTopicSuggestionsEnabled/
    );
  });
});

describe("simple writer profile: the profile", () => {
  it("uses the approved four public tabs", () => {
    expect([...PROFILE_TABS]).toEqual(["overview", "about", "articles", "posts"]);
  });

  it("adds Drafts for the owner only", () => {
    expect([...PUBLIC_PROFILE_TABS]).toEqual(["overview", "about", "articles", "posts"]);
    expect([...OWNER_PROFILE_TABS]).toEqual(["overview", "about", "articles", "posts", "drafts"]);

    const tabs = codeOf("components/profile/ProfileTabs.tsx");
    expect(tabs).toMatch(/isOwnProfile \? OWNER_PROFILE_TABS : PUBLIC_PROFILE_TABS/);

    const page = codeOf("app/(main)/[username]/page.tsx");
    expect(page).toMatch(/isOwnProfile=\{viewer\.isOwnProfile\}/);
    // The drafts list, with its Edit and Delete controls, renders only from
    // the drafts the loader returns, and the loader returns them only to the
    // owner. See lib/profileViewData.test.ts.
    expect(page).toMatch(/tab === "drafts" && drafts \? \(\s*<ProfileDraftList/);
  });

  it("builds the page from the header, the tabs, the list and About, and nothing else", () => {
    const page = codeOf("app/(main)/[username]/page.tsx");
    expect(page).not.toMatch(/\.from\(|\.rpc\(/);
    // A new import on the profile is a new thing on the profile. Add it here
    // on purpose.
    expect(importsOf(page)).toEqual(
      [
        "next",
        "next/navigation",
        "@/components/profile/ProfileAbout",
        "@/components/profile/ProfileOverview",
        "@/components/profile/StickyProfileBar",
        "@/components/profile/ProfileDraftList",
        "@/components/profile/ProfileHeader",
        "@/components/profile/ProfilePublicationList",
        "@/components/profile/ProfileTabs",
        "@/lib/profileFunnel",
        "@/lib/profileIdentity",
        "@/lib/profileLayout",
        "@/lib/profileTabs",
        "@/lib/profileViewData",
        "@/lib/supabase/server",
      ].sort()
    );
  });

  it("sends the record address to the profile, permanently", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects.find((entry) => entry.source === "/:username/record")).toMatchObject({
      destination: "/:username",
      permanent: true,
    });
  });

  it("uses no record, evidence, credibility or completion language on a profile, onboarding or settings surface", () => {
    expect(
      filesMatching(
        /Intellectual Record|intellectual identity|intellectual focus|evidence-backed|Demonstrated (?:expertise|topics)|credibility|citable|source-backed|Featured Work|Selected work|Why I featured|% complete|Complete your profile|Complete profile/i,
        { within: isProfileSurface }
      )
    ).toEqual([]);
  });

  it("reads and writes no persona, positioning, organisation, cover or alumni field where a profile is shown or edited", () => {
    const identitySurfaces = new Set([
      "lib/db/supabase/profiles.ts",
      "lib/db/postgres/profiles.ts",
      "lib/profileIdentity.ts",
      "lib/profileSettings.ts",
      "lib/profileSettingsData.ts",
      "lib/onboarding.ts",
      "lib/onboardingActions.ts",
      "lib/onboardingCompletion.ts",
      "lib/suggestedPeople.ts",
      "lib/discoverData.ts",
      "components/profile/ProfileHeader.tsx",
      "components/profile/ProfileAbout.tsx",
      "components/profile/ProfileTabs.tsx",
      "components/ui/ProfileGate.tsx",
      "app/(main)/[username]/page.tsx",
      "app/(main)/settings/page.tsx",
      "app/(main)/settings/profileActions.ts",
      "app/(main)/admin/analytics/page.tsx",
    ]);
    expect(
      filesMatching(
        /\b(?:profile_type|secondary_profile_types|positioning_statement|organization_name|organization_website|is_alumni|open_to_mentoring|cover_image_url|coverImageUrl|current_path|work_category)\b/,
        {
          allowed: {
            "lib/db/supabase/profiles.ts": "Existing external link projection",
            "lib/db/postgres/profiles.ts": "Same external link projection",
            "components/profile/ProfileAbout.tsx": "Validated external work URL",
          },
          within: (file) =>
            identitySurfaces.has(file) ||
            file.startsWith("app/(main)/settings/profile/") ||
            file.startsWith("app/(onboarding)/"),
        }
      )
    ).toEqual([]);
  });

  it("reads none of the record, featured work, onboarding preference or topic quota data", () => {
    expect(
      filesMatching(
        /\.from\(\s*["'](?:profile_featured_posts|profile_record_entries|user_onboarding_preferences|ai_topic_suggestion_quotas)["']|\bpublic\.(?:profile_featured_posts|profile_record_entries|user_onboarding_preferences)\b/
      )
    ).toEqual([]);
    expect(
      filesMatching(
        /\.rpc\(\s*["'](?:complete_onboarding|save_onboarding_[a-z]+|get_my_onboarding_state|get_public_profile_record_summary(?:_v2)?|replace_my_featured_posts(?:_v2)?|claim_ai_topic_suggestion_quota)["']/
      )
    ).toEqual([]);
  });
});

describe("simple writer profile: onboarding", () => {
  it("is a profile step and an optional topics step", () => {
    expect([...ONBOARDING_STEPS]).toEqual(["profile", "topics"]);
    const client = codeOf("app/(onboarding)/onboarding/OnboardingClient.tsx");
    expect(client).toContain("Skip for now");
    expect(client).not.toMatch(
      /UniversitySelect|WORK_CATEGORY|currently a student|Field of study|Graduation year|Country|Intellectual Record|Publish your first idea/i
    );
  });

  it("goes to Home when it is done, and nothing links to a welcome page", () => {
    expect(codeOf("app/(onboarding)/onboarding/OnboardingClient.tsx")).toContain('router.replace("/")');
    expect(filesMatching(/[?&]welcome=1|welcome%3D1/)).toEqual([]);
    expect(codeOf("app/(main)/explore/page.tsx")).not.toMatch(/\bwelcome\b/);
  });

  it("completes through the server, with the rule checked against what is stored", () => {
    const actions = codeOf("app/(onboarding)/onboarding/actions.ts");
    expect(actions).toContain("completeOwnOnboarding(viewer.userId)");
    expect(actions).not.toMatch(/\.rpc\(/);
    expect(codeOf("lib/onboardingCompletion.ts")).toContain("getOnboardingProfileError(");
  });

  it("asks the composer's profile gate for a name and a username only", () => {
    expect(codeOf("components/ui/ProfileGate.tsx")).not.toMatch(/UniversitySelect|setUniversity/);
    expect(codeOf("app/(main)/settings/profileActions.ts")).not.toMatch(/\buniversity\b/);
  });
});

describe("simple writer profile: settings", () => {
  it("edits the profile in three sections", () => {
    expect([...PROFILE_SETTINGS_SECTIONS]).toEqual(["profile", "topics", "visibility"]);
  });

  it("writes through the column allowlist, and reads no profile row on the account settings page", () => {
    expect(codeOf("app/(main)/settings/profile/actions.ts")).not.toMatch(
      /\.from\("profiles"\)[\s\S]{0,120}?\.update\(/
    );
    const settings = codeOf("app/(main)/settings/page.tsx");
    expect(settings).not.toMatch(/\.from\("profiles"\)|get_my_onboarding_state/);
  });

  it("suggests people without a persona or an onboarding path", () => {
    for (const file of ["lib/suggestedPeople.ts", "lib/discoverData.ts"]) {
      expect(codeOf(file), file).not.toMatch(/currentPath|workCategory|profile_type|get_my_onboarding_state/);
    }
  });
});

describe("simple writer profile: measurement", () => {
  const vocabulary = codeOf("lib/activationEvents.ts");
  const route = codeOf("app/api/activation/route.ts");

  it("records no retired profile, Command Center or topic suggestion event", () => {
    const retired =
      /"(?:profile_recognition_[a-z_]+|profile_expertise_topic_opened|profile_brief_[a-z_]+|profile_command_center_viewed|profile_preview_opened|profile_feature_note_saved|ai_topic_suggestion_[a-z_]+)"/;
    expect(vocabulary).not.toMatch(retired);
    expect(route).not.toMatch(retired);
  });

  it("keeps a 24-name vocabulary, all of which a browser may send", () => {
    const union = vocabulary.slice(
      vocabulary.indexOf("export type ActivationEventName"),
      vocabulary.indexOf("interface ActivationEventPayload")
    );
    const names = [...union.matchAll(/\|\s*"([a-z_]+)"/g)].map((match) => match[1]);
    const allowlist = route.slice(route.indexOf("const ALLOWED_EVENTS"));
    const allowed = [
      ...allowlist.slice(0, allowlist.indexOf("]);")).matchAll(/"([a-z_]+)",/g),
    ].map((match) => match[1]);

    // 26 after Phase 2H. The final UI simplification retired the dashboard
    // view and next-action click events with the dashboard itself.
    expect(names).toHaveLength(24);
    expect(names).not.toContain("dashboard_viewed");
    expect(names).not.toContain("next_action_clicked");
    expect([...allowed].sort()).toEqual([...names].sort());
  });

  it("runs no AI topic suggestion", () => {
    expect(
      filesMatching(/topic-suggestions|claim_ai_topic_suggestion_quota|GEMINI_TOPIC_MODEL|NEXT_PUBLIC_AI_TOPIC_SUGGESTIONS_ENABLED/)
    ).toEqual([]);
  });

  it("reports no Profile Credibility anywhere in admin", () => {
    // The admin analytics page that once carried it was removed in the final
    // UI simplification, so the check covers every admin surface instead.
    expect(existsSync(join(process.cwd(), "app/(main)/admin/analytics"))).toBe(false);
    expect(
      filesMatching(
        /Profile Credibility|Complete Profiles|Partial Academic Profiles|Featured Work Profiles|Citable Author Profiles|Reviewed Author Profiles|isFormallyReviewed/,
        { within: (file) => file.startsWith("app/(main)/admin/") }
      )
    ).toEqual([]);
  });
});
