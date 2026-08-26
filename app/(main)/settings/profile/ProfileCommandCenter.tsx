"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ProfilePreview from "@/components/profile/ProfilePreview";
import {
  getVisibleProfileSections,
  PROFILE_SECTION_DEFINITIONS,
  type ProfileCommandCenterModel,
  type ProfileSectionKey,
} from "@/lib/profileCommandCenter";
import {
  trackCommandCenterViewed,
  trackNextActionClicked,
  trackPreviewOpened,
} from "@/lib/profileOwnerAnalytics";
import { normalizePositioningStatement } from "@/lib/profileIdentity";
import { normalizeFeatureNote } from "@/lib/featuredWork";
import BackgroundSection from "./sections/BackgroundSection";
import FeaturedWorkSection from "./sections/FeaturedWorkSection";
import FocusSection from "./sections/FocusSection";
import IdentitySection from "./sections/IdentitySection";
import OpportunitiesSection from "./sections/OpportunitiesSection";
import OutcomesSection from "./sections/OutcomesSection";
import ResearchSection from "./sections/ResearchSection";
import TopicsSection from "./sections/TopicsSection";
import VisibilitySection from "./sections/VisibilitySection";
import { useUnsavedChangesWarning } from "./useSectionSave";
import type { OwnerOutcome } from "./outcomeActions";

export interface EligibleWork {
  id: string;
  title: string;
  publishedAt: string;
  isCoAuthor: boolean;
}

/**
 * Draft state the preview reads.
 *
 * The preview updates from local drafts rather than from what is saved, so an
 * author can see the effect of a sentence before committing to it. Only text
 * and selection fields live here; media saves immediately and is reflected
 * straight from the model.
 */
export interface CommandCenterDraft {
  fullName: string;
  username: string;
  positioningStatement: string;
  bio: string;
  interests: string[];
  country: string;
  university: string;
  fieldOfStudy: string;
  professionalTitle: string;
  organizationName: string;
  organizationWebsite: string;
  openToOpportunities: boolean;
  opportunityVisibility: string;
  featured: Array<{ postId: string; note: string }>;
  researchHeadline: string;
  researchInterests: string[];
  researchMethods: string[];
  orcidUrl: string;
  researchWebsiteUrl: string;
}

function initialDraft(model: ProfileCommandCenterModel): CommandCenterDraft {
  return {
    fullName: model.identity.fullName,
    username: model.identity.username,
    positioningStatement: model.focus.positioningStatement,
    bio: model.focus.bio,
    interests: model.topics.interests,
    country: model.background.country,
    university: model.background.university,
    fieldOfStudy: model.background.fieldOfStudy,
    professionalTitle: model.background.professionalTitle,
    organizationName: model.background.organizationName,
    organizationWebsite: model.background.organizationWebsite,
    openToOpportunities: model.opportunities.openToOpportunities,
    opportunityVisibility: model.opportunities.visibility,
    featured: model.featured.map((item) => ({
      postId: item.postId,
      note: item.note ?? "",
    })),
    researchHeadline: model.research.headline,
    researchInterests: model.research.researchInterests,
    researchMethods: model.research.methods,
    orcidUrl: model.research.orcidUrl,
    researchWebsiteUrl: model.research.websiteUrl,
  };
}

export default function ProfileCommandCenter({
  model,
  eligibleWork,
  outcomes = [],
  outcomesEnabled = false,
}: {
  model: ProfileCommandCenterModel;
  eligibleWork: EligibleWork[];
  outcomes?: OwnerOutcome[];
  outcomesEnabled?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<CommandCenterDraft>(() => initialDraft(model));
  const [savedDraft, setSavedDraft] = useState<CommandCenterDraft>(() =>
    initialDraft(model)
  );
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const previewCloseRef = useRef<HTMLButtonElement>(null);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sections = getVisibleProfileSections(model);

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(savedDraft),
    [draft, savedDraft]
  );
  useUnsavedChangesWarning(hasUnsavedChanges);

  useEffect(() => {
    trackCommandCenterViewed({
      profileId: model.identity.id,
      section: "overview",
    });
  }, [model.identity.id]);

  // Focus trap and restoration for the mobile sheet. Escape closes it, Tab
  // cycles inside it, and focus returns to the control that opened it.
  useEffect(() => {
    if (!mobilePreviewOpen) return;
    previewCloseRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobilePreviewOpen(false);
        previewTriggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((node) => !node.closest("[inert]"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobilePreviewOpen]);

  const markSaved = (patch: Partial<CommandCenterDraft>) => {
    setSavedDraft((current) => ({ ...current, ...patch }));
    router.refresh();
  };

  /**
   * The preview's view of the draft.
   *
   * Built from public fields only. Nothing private is reachable: opportunity
   * readiness never enters this object, and neither does the onboarding path
   * or work category, so there is no way for the preview to render something
   * a visitor could not see.
   */
  const previewData = useMemo(
    () => ({
      profile: {
        id: model.identity.id,
        username: draft.username || model.identity.username,
        full_name: draft.fullName || null,
        country: draft.country || null,
        university: draft.university || null,
        field_of_study: draft.fieldOfStudy || null,
        graduation_year: model.background.graduationYear
          ? Number(model.background.graduationYear)
          : null,
        is_alumni: model.identity.isAlumni,
        bio: draft.bio || null,
        avatar_url: model.identity.avatarUrl,
        cover_image_url: model.identity.coverImageUrl,
        verified: model.identity.verified,
        verified_type: model.identity.verifiedType,
        profile_type: model.identity.profileType,
        professional_title: draft.professionalTitle || null,
        organization_name: draft.organizationName || null,
        organization_website: draft.organizationWebsite || null,
        positioning_statement: normalizePositioningStatement(
          draft.positioningStatement
        ),
      },
      demonstratedTopics: model.topics.demonstratedTopics,
      interests: draft.interests.filter(
        (interest) =>
          !model.topics.demonstratedTopics.some(
            (topic) => topic.key === interest.trim().toLowerCase()
          )
      ),
      recordSummary: model.recordSummary,
      followerCount: model.followerCount,
      featured: draft.featured.flatMap((selection) => {
        const work = eligibleWork.find((item) => item.id === selection.postId);
        if (!work) return [];
        return [
          {
            id: work.id,
            title: work.title,
            slug: "",
            excerpt: null,
            type: "essay",
            feature_note: normalizeFeatureNote(selection.note),
          },
        ];
      }),
      research: model.research.enabled
        ? {
            headline: draft.researchHeadline || null,
            research_interests: draft.researchInterests,
            methods: draft.researchMethods,
            orcid_url: draft.orcidUrl || null,
            website_url: draft.researchWebsiteUrl || null,
          }
        : null,
      isOpenToOpportunities:
        draft.openToOpportunities && draft.opportunityVisibility !== "private",
    }),
    [draft, eligibleWork, model]
  );

  const preview = (
    <ProfilePreview data={previewData} hasUnsavedChanges={hasUnsavedChanges} />
  );

  const { primary, secondary } = model.nextAction;

  return (
    <div className="mx-auto w-full max-w-[900px] lg:max-w-[1180px]">
      <header className="rounded-xl border border-card-border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-ink">
              Profile
            </p>
            <h1 className="font-display mt-1 text-2xl font-semibold text-ink sm:text-3xl">
              Manage your profile
            </h1>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              Everything a visitor sees, in one place. Account and notification
              settings stay in{" "}
              <Link href="/settings" className="focus-ring font-semibold text-emerald-ink">
                Settings
              </Link>
              .
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              ref={previewTriggerRef}
              type="button"
              onClick={() => {
                setMobilePreviewOpen(true);
                trackPreviewOpened({
                  profileId: model.identity.id,
                  surface: "mobile_sheet",
                  hasUnsavedChanges,
                });
              }}
              aria-haspopup="dialog"
              className="focus-ring inline-flex min-h-11 items-center justify-center rounded-lg border border-card-border bg-card px-4 text-sm font-semibold text-ink-soft hover:text-ink lg:hidden"
            >
              Preview
            </button>
            <Link
              href={`/${model.identity.username}`}
              className="focus-ring inline-flex min-h-11 items-center justify-center rounded-lg border border-card-border bg-card px-4 text-sm font-semibold text-ink-soft hover:text-ink"
            >
              View public profile
            </Link>
          </div>
        </div>

        {/* One dominant action. The two secondary suggestions are text links,
            so the page never presents three equally weighted buttons. */}
        <div className="mt-5 rounded-lg border border-green-wash-border bg-green-tint p-4">
          <p className="text-sm font-semibold text-emerald-ink">{primary.title}</p>
          <p className="mt-1 text-sm leading-6 text-ink-soft">{primary.explanation}</p>
          <Link
            href={primary.href}
            onClick={() =>
              trackNextActionClicked({
                profileId: model.identity.id,
                actionKey: primary.key,
                surface: "command_center",
                rank: "primary",
              })
            }
            className="focus-ring mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white hover:bg-[#0E4B37]"
          >
            {primary.ctaLabel}
          </Link>
          {secondary.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {secondary.map((action) => (
                <li key={action.key}>
                  <Link
                    href={action.href}
                    onClick={() =>
                      trackNextActionClicked({
                        profileId: model.identity.id,
                        actionKey: action.key,
                        surface: "command_center",
                        rank: "secondary",
                      })
                    }
                    className="tap-target focus-ring text-xs font-semibold text-emerald-ink hover:underline"
                  >
                    {action.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </header>

      <nav
        aria-label="Profile sections"
        className="scroll-hint-x mt-5 flex gap-1 overflow-x-auto border-b border-card-border pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {sections
          .filter((key) => key !== "overview")
          .map((key) => (
            <a
              key={key}
              href={`#${key}`}
              className="focus-ring inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-3 text-sm font-semibold text-ink-muted hover:border-card-border-hover hover:text-ink"
            >
              {PROFILE_SECTION_DEFINITIONS[key].label}
            </a>
          ))}
      </nav>

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-6">
          <IdentitySection
            model={model}
            draft={draft}
            setDraft={setDraft}
            onSaved={markSaved}
          />
          <FocusSection
            model={model}
            draft={draft}
            setDraft={setDraft}
            onSaved={markSaved}
          />
          <TopicsSection
            model={model}
            draft={draft}
            setDraft={setDraft}
            onSaved={markSaved}
          />
          <FeaturedWorkSection
            model={model}
            draft={draft}
            setDraft={setDraft}
            eligibleWork={eligibleWork}
            onSaved={markSaved}
          />
          <BackgroundSection
            model={model}
            draft={draft}
            setDraft={setDraft}
            onSaved={markSaved}
          />
          {model.research.enabled ? (
            <ResearchSection
              model={model}
              draft={draft}
              setDraft={setDraft}
              onSaved={markSaved}
            />
          ) : null}
          <OpportunitiesSection
            model={model}
            draft={draft}
            setDraft={setDraft}
            onSaved={markSaved}
          />
          <OutcomesSection
            profileId={model.identity.id}
            outcomes={outcomes}
            enabled={outcomesEnabled}
          />
          <VisibilitySection model={model} />
        </div>

        {/* Desktop rail only. On a phone an editor and a preview side by side
            would leave both unusable, so the preview becomes a sheet. */}
        <aside className="sticky top-6 hidden lg:block">
          <h2 className="sr-only">Profile preview</h2>
          {preview}
        </aside>
      </div>

      {mobilePreviewOpen ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/50 lg:hidden"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setMobilePreviewOpen(false);
              previewTriggerRef.current?.focus();
            }
          }}
        >
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-preview-title"
            className="mt-auto max-h-[92vh] overflow-y-auto rounded-t-2xl border-t border-card-border bg-canvas p-4"
            style={{
              paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 76px))",
            }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2
                id="profile-preview-title"
                className="font-display text-lg font-semibold text-ink"
              >
                Preview
              </h2>
              <button
                ref={previewCloseRef}
                type="button"
                onClick={() => {
                  setMobilePreviewOpen(false);
                  previewTriggerRef.current?.focus();
                }}
                className="focus-ring inline-flex min-h-11 items-center rounded-lg border border-card-border bg-card px-4 text-sm font-semibold text-ink-soft"
              >
                Close
              </button>
            </div>
            {preview}
          </div>
        </div>
      ) : null}
    </div>
  );
}
