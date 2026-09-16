# Indegenius Publishing Reset: Phase 1 Audit

| | |
|---|---|
| Date | 2026-09-14 |
| Audited ref | `migration/neon-preview` at `6df4a7d` (working tree) |
| Production ref | `origin/main` at `6341d0e` |
| Checkpoints | tag `archive/pre-publishing-reset` (`6df4a7d`), tag `archive/pre-publishing-reset-main` (`6341d0e`) |
| Scope | Read-only audit, plus deletion of 19 verified-dead files (see §16.4). No database, route or feature change. |

Everything below was traced from source: an import graph over `app/`, `components/`, `lib/`, `scripts/` and `proxy.ts`, the SQL history in `supabase/`, and the audit JSON already in `scripts/audit/`. The production database was **not** queried. The Supabase connector is unauthorised in this session, and [docs/pending-migration-decisions.md](docs/pending-migration-decisions.md) establishes that the catalogue, not `supabase/migrations/`, is the source of truth. Every database claim here is a planning claim until it is checked against the live catalogue (see I13).

---

## 1. Executive Summary

**What Indegenius is today.** A Next.js 16 App Router monolith on Supabase that has grown into an "intellectual social network" with a publishing product inside it. The repository carries 74 pages, 33 route handlers, 130 SQL migrations defining roughly 80 live tables and around 150 RLS policies, 262 test files, and 26 notification types. Publishing is one of about seventeen product systems. Research, opportunities, campus, messaging, co-authorship, credibility, gamification and subscriptions each have their own routes, tables, triggers, notifications and analytics events.

**How far it is from the target.** Closer than the surface suggests, in the places that matter most:

- **The composer is already the target.** `/write` (`UniversalComposer`) is one title-optional canvas. `derivePresentationClassification()` in [lib/contribution.ts](lib/contribution.ts) writes `content_kind = "post"` when there is no title and `"article"` when there is one. No type picker remains. What has to go is attached around it: co-author picker, campus prompts, response parents, draft share links and the legacy typed actions.
- **The data model already has the right column.** `posts.content_kind` holds `post | article | research`. The legacy `posts.type` (`blog | essay | policy_brief | research`) is still `NOT NULL` and dual-written, and `article_format` carries the essay and policy-brief genres.
- **Follow, like, comment, bookmark, share and search all exist and work** independently of the systems being removed, with three exceptions called out in INVESTIGATE: follow is wrapped in the subscription UI, likes, comments and publishes award points through database triggers, and the comment box has a "promote to Response" path.

The distance is in everything around that core:

- **Navigation advertises the old product.** The mobile bar reads *For you · Discover · Responses · Record*. The desktop rail adds *Campus, My record, Opportunities, Messages*. The account menu is labelled *Intellectual Record*. There is no Notifications destination on mobile.
- **Home is a dashboard, not a feed.** Up to five tabs, an editor's-pick lead, people and topic interludes, a push-permission banner, a welcome banner, and a sidebar "intellectual brief" with activation and featured-today cards. The page makes 9 parallel queries before the feed itself starts loading.
- **Feature flags hide less than they appear to.** `FEATURE_FLAGS.fellowshipsSection`, `ambassadors` and `talentMarketplace` are all `false`, but `/opportunities`, `/fellowships`, `/talent`, `/ambassadors`, `/campus`, `/leaderboard`, `/alumni`, `/partners` and `/policy` never read them. They are reachable, and `/opportunities` and `/campus` are in the nav and in `sitemap.xml`. Only Research is actually gated.
- **Gamification lives in the database.** Points are awarded by triggers on `posts`, `likes`, `comments` and `post_reviews`, and badges by triggers on `posts` and `profiles`. Removing the leaderboard page removes nothing.

**Headline counts.** 14 KEEP · 21 SIMPLIFY · 24 REMOVE · 15 INVESTIGATE (§3 to §6).

**Biggest dependency risk.** The `posts` table. Every system being removed writes to it or constrains it: `type NOT NULL CHECK`, `content_kind`, `article_format`, the title check constraint, `guard_locked_post_write`, citation IDs, `in_response_to`, research document columns, and the publish-time point and badge triggers. It is also the table every KEEP feature depends on. See I1 and I2.

**Recommended first deletion target.** Research (R1 with R2, R13). It is the only system already behind a real kill switch (`isResearchEnabled()` gates the layout, the post page, the edit route, `/publication` and `/review`), so removing its routes changes nothing a user can currently see. It also unblocks the largest amount of downstream simplification: the review workflow, citation IDs, the legacy `EditForm`, research branches in `HomeFeedCard`, `FeedSkeleton`, `feedData`, `searchData` and the post page.

---

## 2. Current Product Map

| # | System | Primary surfaces | State as shipped |
|---|---|---|---|
| 1 | Auth and accounts | `(auth)/*`, `auth/callback`, `auth/confirm`, `proxy.ts`, `/settings` | Live |
| 2 | Onboarding | `(onboarding)/onboarding`, proxy gate on `onboarding_completed` | Live, 3 steps (path, identity, topics) |
| 3 | Publishing (Post and Article) | `(write)/write`, `/edit/[slug]`, `/post/[slug]`, `/dashboard` | Live, one composer |
| 4 | Research and editorial review | `/research/*`, `/submit/research`, `/review/*`, `/admin/review`, `/admin/research`, `/publication/[citationId]`, `/editorial-standards` | Code live, routes 404 via `isResearchEnabled()` except `/editorial-standards` |
| 5 | Home feed | `/` (`PostsFeedSection`, `PostsFeedTabs`, `HomeSidebar`), `/api/feed` | Live, 2 to 5 tabs |
| 6 | Explore and search | `/explore`, `/discover` (redirect), `/search`, `SearchOverlay`, `/api/search` | Live |
| 7 | Topics | `/topics`, `/topics/[tag]`, `/api/topics` | Live |
| 8 | Social interactions | likes, comments, bookmarks, follows, share | Live |
| 9 | Responses | `/responses`, `in_response_to`, Discussion section, bottom-nav tab | Live, primary nav |
| 10 | Notifications | `/notifications`, `NotificationBell`, email, web push | Live |
| 11 | Profiles and Intellectual Record | `/[username]`, `/[username]/record`, `/me`, `/settings/profile` | Live |
| 12 | Credibility, evidence, citation identity | `CredibilityPanel`, `EvidenceLabels`, `CiteThis`, Explore "Citable" tab | Partly live, graph gated off |
| 13 | Gamification | `/leaderboard`, `/stats`, `PointsTierBadge`, points and badge triggers | Live, reachable |
| 14 | Direct messaging | `/messages/*`, `/api/messages/*`, profile Message button | Live, in nav |
| 15 | Co-authorship | `CoAuthorPicker` in composer, `CollaborationPanel`, dashboard card | Live |
| 16 | Opportunities, fellowships, talent | `/opportunities`, `/fellowships/*`, `/talent`, `/admin/fellowships`, profile opportunity sections | Live, reachable, in nav |
| 17 | Campus, ambassadors, alumni | `/campus`, `/ambassadors/*`, `/alumni`, `/admin/campuses`, `/admin/ambassadors` | Live, reachable, Campus in nav |
| 18 | Sponsors, partners, policy hub | `/partners`, `/policy`, `/admin/sponsors`, `/admin/partners`, `SponsorBanner` | Reachable |
| 19 | Author and topic subscriptions | `/subscriptions`, `/stats`, `/r/p/[token]`, publication delivery cron | Schema live, env flags off |
| 20 | Retention and activation | `activation_events`, `PushPromptBanner`, `WelcomeBanner`, `RetentionThisWeek`, daily brief cron, `record_user_activity_day` | Live |
| 21 | AI extras | `/api/topic-suggestions` (Gemini), `/api/audio-summary` (Claude + Google TTS) | Topic AI flag off, audio only on review acceptance |
| 22 | Email broadcasts | `/admin/communications`, Resend webhook, segment sync cron | Live, operational |
| 23 | Trust and safety | reports, blocks, suspension, `/admin/moderation`, `/admin/verification` | Live |
| 24 | Migration infrastructure | `lib/db`, `scripts/migration`, `/api/migration-status`, telemetry, write freeze | Live, in progress |

Already removed before this audit, which is useful as a template: **Debates**. See `20260906000003_remove_debate_cron_jobs.sql`, `20260906000004_remove_debate_schema.sql` and `supabase/migrations/debateRemovalMigration.test.ts`. That migration redefines every shared object first, drops second, and ships a psql export block. Phase 2 database work should copy its shape.

---

## 3. KEEP

Core infrastructure that belongs in the new product as it is. "As it is" means the implementation is not the problem, not that no line changes.

| # | System | Exact code | Database |
|---|---|---|---|
| K1 | Authentication and session | `app/(auth)/*` (login, signup, forgot, reset, `AuthShell`, `accountEmailActions.ts`), `app/auth/callback`, `app/auth/confirm`, `app/api/auth/[...all]`, `proxy.ts` (cookie refresh, protected routes), `lib/serverAuth.ts`, `lib/serverActions.ts`, `lib/useSignOut.ts`, `lib/supabase/{client,server,admin,fetchTimeout}.ts`, `lib/auth/betterAuth.ts` | `auth.users`, `handle_new_user` trigger, `profiles` row creation |
| K2 | Post reading core | `post/[slug]/{BodyContents,TableOfContents,ReadingProgressBar,HighlightShare,ShareButtons,ViewTracker,PostEngagementContext}.tsx`, `lib/postBySlug.ts`, `lib/sanitizePostHtml.ts`, `lib/articleTypography.ts`, `lib/postDisplay.ts`, `lib/postEngagementToken.ts`, `app/api/posts/[slug]/{view,read}` | `posts` (core columns), `post_engagement_events`, `increment_view_count` |
| K3 | Likes | `post/[slug]/likeActions.ts`, `FeedEngagementActions` like button | `likes`, `post_like_counts`, `increment/decrement_post_like_count` triggers |
| K4 | Comments | `post/[slug]/{commentActions.ts,CommentThread,CommentsLoader}`, `lib/{commentThread,commentSort,commentContent}.ts`, `lib/db/{comments,commentVisibility}.ts` | `comments`, `comment_votes`, `toggle_comment_vote`, `count_visible_comments_by_post` |
| K5 | Bookmarks | `app/(main)/bookmarks`, `post/[slug]/bookmarkActions.ts`, `app/api/bookmarks`, `lib/db/bookmarks.ts` | `bookmarks`, `post_bookmark_counts`, count triggers |
| K6 | Follow graph | `components/ui/followActions.ts` (`toggleFollow`), `[username]/followers`, `[username]/following`, `lib/profileRelationships.ts` | `follows`, `notify_on_follow` |
| K7 | Share | `post/[slug]/ShareButtons.tsx`, `components/profile/ShareButton.tsx`, `app/api/og` | none |
| K8 | Media upload | `app/api/upload-image`, `components/ui/{CoverImageUploader,ImageLightbox}.tsx`, `settings/AvatarUploader.tsx`, `components/post/{PostCover,PostImage}.tsx` | buckets `avatars`, `post-images` |
| K9 | Drafts, autosave, edit, delete | autosave in `UniversalComposer`, `(write)/write/{MyDrafts,RevisionHistory,editActions.ts,deleteActions.ts,revisionActions.ts}`, `lib/{postMutations,postPolicy,postDeletion,postSlug,composerLimits}.ts`, `lib/db/{postWrites,composer}.ts` | `post_edit_drafts`, `apply_post_edit_draft`, `post_revisions`, `record_post_revision` |
| K10 | Trust and safety | `components/moderation/*`, `lib/{blocking,suspension}.ts`, `admin/moderation` | `reports`, `user_blocks`, `is_blocked_pair`, `is_suspended`, `profiles.suspended_*` |
| K11 | Transactional email | `lib/{email,emailSenders,emailShell}.ts`, `(auth)` email flows | `profiles.notification_prefs` (core keys) |
| K12 | Email broadcasts (admin) | `admin/communications/*`, `lib/broadcast*.ts`, `lib/resend*.ts`, `app/api/webhooks/resend`, `app/api/cron/resend-segment-sync` | six `broadcast_*` tables and their functions |
| K13 | Platform and migration infrastructure | `lib/db/*`, `scripts/migration/*`, `scripts/audit/*`, `app/api/migration-status`, `lib/{writeFreeze,rateLimit,cronAuth,site,utils}.ts`, `app/api/cron/health`, `app/{robots,manifest,sitemap}.ts` | `private.*` telemetry and cron tables, Supabase Cron scheduler functions |
| K14 | Static, legal, UI primitives | `about`, `privacy`, `terms`, `not-found`, `error`, `global-error`, `components/ui/{Button,Badge,Tag,Toast,UserAvatar,BackLink,EmptyState,StickySubnav,BrandWordmark,Footer,GuestAuthGateProvider}.tsx` | none |

---

## 4. SIMPLIFY

Something useful stays. The implementation carries the old product with it.

| # | System | Exact code | Why, and what stays |
|---|---|---|---|
| S1 | Composer | `(write)/write/UniversalComposer.tsx` (1,216 lines), `write/page.tsx`, `write/actions.ts` (1,449 lines), `ArticlePreview`, `components/ui/{TagInput,ProfileGate}.tsx` | Keep the title-optional canvas, autosave, topics, cover, references, preview, revision history. Remove `CoAuthorPicker`, campus `prompt`, response `parent`, `DraftShareControl`. ~700 lines of `actions.ts` (`ensureDraft`, `publishPost`, `savePostReferences`) have no production caller. See §11. |
| S2 | Home page | `app/(main)/page.tsx`, `PostsFeedSection.tsx`, `PostsFeedTabs.tsx` (1,010 lines), `HomeGuestNotice`, `FeedEmptyState`, `FeedErrorState` | One publication feed. Remove subscription and topic tabs, featured lead, interludes, sidebar, banners. See §12. |
| S3 | Feed data and ranking | `lib/feedData.ts` (1,764 lines), `lib/feedRanking.ts`, `lib/feedExposure.ts`, `lib/postQuality.ts`, `lib/readerSignals.ts`, `app/api/feed`, `lib/db/{feed,feedList}.ts` | Keep pagination, blocking, following and latest. Strip research exclusion, response hydration, citation, reference, response and university signals, subscription candidates, and `fetchCitableFeed`. |
| S4 | Explore | `explore/page.tsx` (1,012 lines), `ExploreFeed`, `ExploreTopicsGrid`, `ExploreTrackedLink`, `exploreFilters.ts`, `lib/discoverData.ts` | Keep trending, topics and people. Remove the "Citable" tab, `OpportunitiesRailCard`, `ConversationsRailCard` (Responses), `MoreDestinationsCard` (Campus), `MobileOpportunitiesBanner`, `IntellectualRecordWelcome`, the genre filter and the Research filter. |
| S5 | Search | `search/page.tsx`, `lib/searchData.ts`, `components/ui/SearchOverlay.tsx`, `lib/db/search.ts` | Remove the opportunities result set, `OpportunityResult` and the reviewed or citable `SearchSignalBadge`. |
| S6 | Topics | `topics/page.tsx`, `TopicsClient`, `topics/[tag]`, `lib/tags.ts`, `app/api/topics`, `posts.topic_keys` trigger | Keep as a tag primitive. Remove `TopicSubscribeButton` from topic pages and grids. |
| S7 | Notifications | `notifications/{page,NotificationsPageClient,NotificationItem,actions}.tsx`, `components/ui/NotificationBell.tsx`, `lib/notification*.ts`, `lib/actionInbox.ts`, `app/api/notifications/*` | Keep comment, like, follow, publish and moderation types. Remove filters *Responses, Review, Opportunities, Subscriptions*, and 19 of the 26 descriptor types in `lib/notificationCatalog.ts` (kept: `account_suspended`, `moderation_post_removed`, `moderation_comment_hidden`, `post_published`, `comment`, `follow`, `like`). |
| S8 | Public profile | `[username]/page.tsx`, `components/profile/{ProfileHeader,ProfileIdentityPanel,ProfileBackground,ProfileStickyBar,ProfileSectionNav,FeaturedWork}.tsx`, `lib/profileViewData.ts` | Identity plus Posts and Articles. See §14. |
| S9 | Profile settings | `settings/profile/*` (`ProfileCommandCenter`, 9 sections), `lib/profileCommandCenter*.ts`, `lib/profileOwnerAnalytics.ts` | Keep Identity (name, username, avatar, bio, cover) and optionally Topics. Remove Research, Opportunities, Outcomes, Focus (positioning), Background persona fields. |
| S10 | Account settings | `settings/page.tsx`, `NotificationsForm` (18 email keys), `PrivacyForm`, `AccountForm`, `SubscribedAuthorsManager`, `SubscribedTopicsManager` | Cut email keys to the kept notification types. Remove the two subscription managers. |
| S11 | Onboarding | `(onboarding)/onboarding/*` (863-line client), `lib/{onboarding,onboardingActions,interests,profileTypes}.ts`, proxy gate | Reduce to name, username and optional topics. Drop the "path" persona step and the student-specific university and field requirement. |
| S12 | Writing dashboard | `dashboard/page.tsx` (1,142 lines), `PostsTable`, `StatsBar`, `QualitySignals`, `PortfolioProgressCard` | Keep drafts and published list with basic stats. Remove opportunity, collaboration, retention, editorial trust, action inbox and quality panels. |
| S13 | Account hub `/me` | `app/(main)/me/page.tsx` | Currently the mobile "Record" destination. Fold into the Profile destination or a menu. |
| S14 | Navigation shells | `NavClient`, `SideRail`, `BottomNav`, `NavUserMenu`, `navItems.tsx`, `navRoutes.ts`, `CreateLauncher`, `CreateTrigger`, `NavigationShell`, `AppShell` | See §13. |
| S15 | Analytics | `lib/{activationEvents,activationServer}.ts` (~100 event names), `app/api/activation`, `components/retention/{RetentionEventTracker,TrackedActionLink}.tsx`, `record_user_activity_day` in `(main)/layout.tsx` | Keep a small event vocabulary for the core loop. Stop calling an RPC on every navigation. |
| S16 | References and sources | `components/post/ReferencesPanel.tsx`, `components/ui/{ReferenceFields,ReferenceRow}.tsx`, `lib/{postReferences,citationResolution}.ts`, `post_references`, `[ref:id]` shortcodes | Keep "add sources to an Article". Reconsider DOI, `ref_type` and inline citation insertion. |
| S17 | Web push | `lib/{push,pushClient,pushSubscriptionActions}.ts`, `settings/pushActions.ts`, `components/push/ServiceWorkerRegister.tsx`, `push_subscriptions` | Keep as a delivery channel for kept notifications. Remove the prompt banner and nudge policy (R17). |
| S18 | Admin hub | `admin/page.tsx`, `admin/layout.tsx`, `admin/analytics/*`, `lib/adminAccess.ts` | Keep moderation, communications and a reduced analytics page. Remove research, review, fellowships, ambassadors, campuses, sponsors, partners and digest. |
| S19 | Brand and landing copy | `lib/brand.ts` ("Africa's First Intellectual Social Network", "Build your intellectual identity"), `(marketing)/landing/*`, home `metadata` title, `Footer` links | Copy and links name removed systems. Needed for the product to read as a publishing platform. |
| S20 | Featured work | `components/profile/{FeaturedWork,FeaturedWorkManager}.tsx`, `lib/featuredWork.ts`, `settings/profile/sections/FeaturedWorkSection.tsx`, `profile_featured_posts`, `replace_my_featured_posts(_v2)` | Reduce to optional pinned posts without notes or evidence chips, or remove. Product decision. |
| S21 | Profile identity fields | `lib/{profileIdentity,profileTypes,academicIdentity}.ts`, `profiles.{profile_type,secondary_profile_types,organization_name,organization_website,professional_title,positioning_statement}` | A writer profile needs a name, bio and perhaps one headline, not a persona taxonomy. |

---

## 5. REMOVE

Belongs to the old direction. Removal is safe once the listed coupling in INVESTIGATE is handled first.

| # | System | Frontend | Backend | Database (candidates, do not drop yet) |
|---|---|---|---|---|
| R1 | Research | `app/(main)/research/*` (layout, page, profile, projects, proposals), `submit/research/*`, `components/research/ResearchProjectCard.tsx`, `settings/profile/sections/ResearchSection.tsx`, research branches in `post/[slug]/page.tsx` (`ResearchDossierSidebar`, `ResearchDossierDisclosure`, `ResearchReviewTimeline`), `HomeFeedCard` (`ResearchFeedCard`, `ResearchDocumentPreview`, `ResearchManuscriptRow`), `FeedSkeleton` research variant, `components/topic/PublishingTopicSelector.tsx` | `research/actions.ts`, `submit/research/actions.ts`, `admin/research/*`, `lib/research.ts`, `api/research-document/*`, `api/research-project-assets/*`, `FEATURE_FLAGS.research`, `RESEARCH_TYPE_QUERY_EXCLUSION` (used in 14 production files) | `researcher_profiles`, `research_projects`, `research_project_{members,updates,assets,events}`, `research_collaboration_requests`, `research_expansion_targets`, buckets `research-documents` and `research-project-assets`, `posts.document_*`, `posts.pdf_url` |
| R2 | Editorial review workflow | `review/*`, `admin/review/*` (`AssignReviewers`, `ReviewActions`, `FeaturePostButton`), `edit/[slug]/EditForm.tsx`, `components/editorial/EditorialTrustPanel.tsx`, `editorial-standards`, "Review" in `NavUserMenu`, `PostsTable` withdraw action | `lib/reviewWorkflow.ts`, `lib/editorialTrust.ts`, `review/actions.ts`, `edit/[slug]/actions.ts`, `write/actions.ts#withdrawSubmission`, `api/cron/review-reminders` and Supabase job `indegenius-review-reminders` | `post_reviews`, `post_editor_decisions`, `submission_tracks`, `post_versions` (I5), `posts.{current_round,revision_due_at,published_version_id}`, `guard_post_review_submission`, `is_post_reviewer`, `is_editor_or_admin`, `withdraw_post_submission`, `notify_post_approved`, `is_legacy_policy_brief_in_flight`, `public_review_signals` view |
| R3 | Opportunities, fellowships, talent | `opportunities`, `fellowships/*`, `talent`, `admin/fellowships/*`, `components/opportunities/*`, `components/profile/{ContactInquiryModal,opportunityInquiryActions}.tsx`, `dashboard/opportunityInquiryActions.ts`, `settings/profile/sections/{OpportunitiesSection,OutcomesSection}.tsx`, `settings/profile/outcomeActions.ts`, SideRail and Footer links, profile "Open to opportunities" | `lib/{opportunities,opportunityMatch,opportunityReadiness,talentDiscovery,applicationReview,profileCredibility}.ts`, `fellowships/[id]/applyActions.ts`, search opportunities branch | `fellowships`, `fellowship_applications`, `saved_opportunities`, `talent_profiles`, `talent_inquiries`, `opportunity_outcomes`, `opportunity_outcome_events`, `public_opportunity_outcomes` view, outcome RPCs (5), touch triggers (2) |
| R4 | Campus | `campus`, `admin/campuses/*`, `components/campus/CampusPromptLink.tsx`, nav links (top bar, rail), composer `?prompt=` path, digest prompt section | `lib/campus.ts`, `write/actions.ts#validateCampusPrompt`, `write/page.tsx` prompt loader | `campus_programs`, `campus_cohorts`, `campus_cohort_memberships`, `campus_editorial_prompts`, `campus_prompt_submissions`, `assign_profile_to_selected_campus_cohort` (trigger on `profiles`), `backfill_selected_campus_cohort_memberships`, `get_campus_candidates`, `get_campus_cohort_metrics` |
| R5 | Ambassadors | `ambassadors/*`, `admin/ambassadors/*`, Footer link | `ambassadors/apply/actions.ts`, `ambassadors/dashboard/actions.ts`, `admin/ambassadors/actions.ts`, `FEATURE_FLAGS.ambassadors` | `campus_ambassadors`, `campus_ambassador_activity` |
| R6 | Alumni and mentoring | `alumni` | `promote_alumni` pg_cron job | `profiles.{is_alumni,open_to_mentoring,graduation_year}` (I9) |
| R7 | Sponsors and partners | `partners/*`, `admin/sponsors/*`, `admin/partners/*`, `components/ui/SponsorBanner.tsx` | `app/api/partner-contact`, `lib/contactRequests.ts` | `sponsor_placements`, `institutional_partners`, `contact_requests`, `webinars`, `webinar_attendees`, `webinar_questions` (schema only, no app code) |
| R8 | Policy hub and article genres | `policy/*` (`FeaturePolicyButton`), Explore genre filter, `ARTICLE_FORMAT_LABELS` badges | `policy/actions.ts`, `isLegacyPolicyBriefInFlight` | `policy_briefs_featured`, `posts.article_format` (I1) |
| R9 | Responses as a product | `responses`, BottomNav, NavClient and SideRail tabs, `post/[slug]/PostResponsesSection`, response half of `DiscussionSection`, "promote" path in `InlineResponseComposer`, `components/post/ResponseStartLink.tsx`, `ReadingBar` Respond, `ParentPostLink`, `hideRespondingTo` in cards, Explore `ConversationsRailCard` | `lib/responsePost.ts`, `fetchResponsePage`, `fetchResponseCards`, `fetchRecentResponsePage` in `feedData`, response counts in ranking | `posts.in_response_to` (I5), `response_post` notifications, `email_responses` pref, `20260802000002_response_points.sql` |
| R10 | Intellectual Record | `[username]/record`, `components/profile/{ProfileRecordCard,EvidenceLabels,EvidenceLegend,ProfilePreview}.tsx`, `components/ui/IntellectualRecordWelcome.tsx`, record metrics in `ProfileIdentityPanel`, "Intellectual Record" in `NavUserMenu`, "Record" and "My record" nav labels | `lib/{intellectualRecord,profileRecord,profileRecordData,profileRecordMetrics}.ts`, `lib/db/profileRecord.ts`, `profileRecordRepository` | `profile_record_entries` view, `get_public_profile_record_summary(_v2)` |
| R11 | Gamification | `leaderboard`, points section of `stats`, `components/ui/PointsTierBadge.tsx`, HomeSidebar "See all" link to `/leaderboard` | none in app beyond reads | `profiles.points`, `badges`, `user_badges`, triggers `on_post_published_points`, `on_post_published_badges`, `on_like_points`, `on_like_delete_points`, `on_comment_points`, `on_review_submitted_points`, `on_points_updated`, functions `award_points_on_*` (4), `reverse_points_on_unlike`, `check_and_award_badges`, `check_points_badges` (I2) |
| R12 | Credibility, recognition, evidence | `components/post/CredibilityPanel.tsx`, `quality_reason` chips, `dashboard/QualitySignals.tsx`, evidence chips on profile | `lib/{credibilityGraph,credibilityGraphData,demonstratedExpertise,profileCredibility}.ts`, `getPostQualitySummary` surfacing, `NEXT_PUBLIC_CREDIBILITY_GRAPH_ENABLED` | `get_public_credibility_summary`; `post_citation_edges`, `profile_recognitions` and `opportunity_applications.outcome_verified_at` from `20260827000001..3` are documented as **not** applied in production |
| R13 | Citation identity | `publication/[citationId]`, `post/[slug]/{CiteThis,CopyCitationIdButton}.tsx`, `PostReferencesAndCitation` citation half, Explore "Citable" tab, `isFormallyReviewed` labels | `lib/citationId.ts`, `fetchCitableFeed` | `posts.citation_id`, `citation_sequences`, `generate_citation_id`, `public_citation_edges` view |
| R14 | Direct messaging | `messages/*`, `components/ui/MessagesUnreadBadge.tsx`, NavClient icon, SideRail link, profile Message button, `CollaborationPanel` message CTA | `app/api/messages/*`, `messages/[id]/actions.ts`, `lib/{conversationActions,messagingEligibility}.ts`, `lib/db/messaging.ts`, `messagingRepository`, message email | `conversations`, `conversation_participants`, `messages`, `find_or_create_conversation`, `can_send_message_in_conversation`, `touch_conversation_last_message`, `enforce_message_soft_delete`, `email_messages` pref |
| R15 | Co-authorship | `components/collaboration/*` (`CoAuthorPicker`, `CollaborationPanel`, `CollaborationDashboardCard`), `HeaderCoAuthors`, `CoAuthorRecord`, `AuthorAndCollaborationSection`, co-author count in cards | `lib/collaboration.ts`, `lib/db/collaboration.ts`, `syncAuthors` and `syncDraftAuthors` in `write/actions.ts`, co-author notifications and emails | `post_authors` (I4), `is_post_coauthor`, `create/respond_research_collaboration_request`, `email_co_author_*` prefs |
| R16 | Audio summaries | `components/post/AudioSummaryPlayer.tsx` (2 sites in post page) | `app/api/audio-summary` (callers: `admin/review/actions.ts:322` and the dead `publishPost`), `ANTHROPIC_API_KEY`, `GOOGLE_TTS_API_KEY` | `posts.audio_summary_url`, bucket `audio-summaries` |
| R17 | Retention and activation nags | `components/push/{PushPromptBanner,usePushNudge}.tsx`, `components/ui/{WelcomeBanner,ActivationBanner}.tsx`, `components/retention/RetentionThisWeek.tsx`, HomeSidebar activation card, `admin/analytics/ProfileReminderButton.tsx` | `lib/{activation,retention,profileNextAction,pushPromptPolicy,pushNudgeStorage}.ts`, `record_user_activity_day` call in `(main)/layout.tsx` | `user_activity_days`, `profiles.push_prompt_{attempt_count,last_shown_at,shown_at}`, `last_engagement_push_notified_at`, `get_phase0_measurement_baseline`, `email_profile_reminders` pref |
| R18 | Daily brief and digest | `admin/digest/*` | `app/api/cron/daily-brief` and job `indegenius-daily-brief`, `lib/dailyBrief.ts` (featured-candidate helpers are also used by Home), `DAILY_BRIEF_DRY_RUN` | `email_digest` pref (keep key if a digest ever returns) |
| R19 | Feed clutter modules | `components/ui/{HomeSidebar,BriefColumn}.tsx`, `components/post/{PeopleInterlude,TopicInterlude,HomeFeaturedLead,HomeFeaturedLeadImpression}.tsx`, `app/dev-preview/feed`, `lib/devFixtures/homeFeedFixtures.ts` | featured ranking block in `app/(main)/page.tsx`, `getFeaturedPostCandidates`, `getEngagementCounts` | `posts.featured` |
| R20 | Author and topic subscriptions | `subscriptions/*`, `stats` subscriber funnel, `settings/Subscribed{Authors,Topics}Manager.tsx`, `components/topic/{TopicSubscribeButton,topicActions}.tsx`, `components/profile/{AuthorRelationshipControlsV2,AuthorRelationshipProvider}.tsx`, "Subscribed" and "Topics" Home tabs, `r/p/[token]` | `lib/{publicationDelivery,publicationDistribution}.ts`, `followActions.setAuthorSubscription`, `app/api/cron/process-publication-deliveries` and job `indegenius-publication-recovery`, three `NEXT_PUBLIC_*SUBSCRIPTIONS*` flags | `author_subscriptions`, `author_subscription_events`, `topic_subscriptions`, `publication_events`, `publication_deliveries`, ~14 functions, `email_author_publications` pref (I3) |
| R21 | AI topic suggestions | `PublishingTopicSelector` suggest button | `app/api/topic-suggestions`, `lib/{geminiTopicSuggestions,topicSuggestions}.ts`, `GEMINI_API_KEY`, `GEMINI_TOPIC_MODEL`, `NEXT_PUBLIC_AI_TOPIC_SUGGESTIONS_ENABLED` | `ai_topic_suggestion_quotas`, `claim_ai_topic_suggestion_quota`, `posts.research_keywords` |
| R22 | Draft share links | `(write)/write/DraftShareControl.tsx`, `app/draft/[token]` | `(write)/write/shareActions.ts` | `post_draft_shares` |
| R23 | Lite mode | `.lite-mode` class in `(main)/layout.tsx` | `lib/liteMode.ts` (its only setter, `LiteModeToggle`, was already unimported and was deleted in Phase 1) | none |
| R24 | Legacy typed composer actions | none (no UI caller) | `write/actions.ts`: `ensureDraft`, `publishPost`, `savePostReferences` (~700 lines, referenced only by `actions.test.ts`) | none |

---

## 6. INVESTIGATE

Removal could break a kept feature or strand existing data. Each needs a decision or a measurement before Phase 2 touches it.

| # | Item | What is coupled | What to find out |
|---|---|---|---|
| I1 | `posts` content-type columns | `type text NOT NULL CHECK (blog, essay, research, policy_brief)` dual-written by `legacyTypeForNewContent()`. `content_kind` and `article_format` with CHECKs, `effective_content_kind()`, `posts_title_required_unless_post_check`, `sync_post_content_classification` trigger, `guard_locked_post_write` and `guard_locked_post_child_write` (lock reviewed research and policy briefs). 41 production files import `lib/contentModel.ts`. | Row counts by `type` and `content_kind` in production. Whether `type` can become nullable or be derived. That the lock guards stop protecting nothing a KEEP flow needs. |
| I2 | Gamification triggers on kept tables | Six point and badge triggers fire on writes to `posts`, `likes`, `comments` and `profiles` (a seventh is on `post_reviews`). `profiles.points` is read by leaderboard, stats, cards and possibly ranking. | Which triggers exist in the live catalogue (the repo shows both `on_like_insert` and `on_post_liked` style duplicates). Drop triggers before dropping functions, and before any UI stops reading points. |
| I3 | Follow wrapped in subscriptions | `FollowButton` renders `AuthorRelationshipControls` whenever subscription UX v2 is on. `AuthorRelationshipControls` imports `setAuthorSubscription`. `FollowButton`, `followActions` and `PostCard` import types from `lib/publicationDelivery.ts`. `remove_author_subscriptions_for_block` runs on block. `AuthorRelationshipProvider` wraps every post page. | Replace `FollowButton` with a plain `toggleFollow` button first. Confirm the env flags are off in every environment so no member holds subscriptions they would silently lose. |
| I4 | `post_authors` | Co-author feature, but `syncAuthors` also upserts the **owner** row, `is_post_coauthor` appears in visibility checks, the post page's pending-access check reads it, and `loadProfilePublications` merges co-authored posts into a profile. `guard_locked_post_child_write` protects it. | Whether any read depends on the owner row existing. How many accepted co-authorships exist, since removing the feature removes those posts from co-authors' profiles. |
| I5 | Existing content in removed formats | Published `research` and `policy_brief` rows, `in_response_to` responses, `citation_id` values with public `/publication/[citationId]` URLs, `post_versions` for reviewed publications, audio URLs. | Counts per format and status. Whether reviewed pieces become plain Articles (strip locks) or are archived. Redirect `/publication/[citationId]` to `/post/[slug]` rather than 404. Whether responses become ordinary posts with the parent link dropped. |
| I6 | Notification types and preferences | 26 descriptor types in `lib/notificationCatalog.ts`, `notify_on_*` and `notify_post_*` triggers (both naming generations present in the repo), JSONB `profiles.notification_prefs` with 18 email keys and a write allowlist, historic `notifications` rows of removed types that `NotificationItem` still renders. | Which `notify_*` triggers are live. Follow the Debate removal pattern: strip keys from JSONB and the allowlist, delete only rows of removed types. |
| I7 | Neon migration branch | This branch is 49 commits and 313 files ahead of production. `MIGRATABLE_READ_DOMAINS` includes `collaboration` and `messaging`. `lib/db/postgres/*` ports post and profile reads including `audio_summary_url`, `citation_id` and record fields. `lib/db/parity.ts`, `scripts/migration/read-registry.mjs` and `preview-check.mjs` enumerate files. | Where Phase 2 lands: on this branch, after it merges, or on `main`. Deleting features here widens the merge; deleting on `main` conflicts with it. Each domain removal must update the Supabase and Postgres implementations, parity fields and the registry together. |
| I8 | Parallel profile rebuild | `feature/profile-rebuild` is checked out in `C:/dev/Think_Africa-profile` (2 commits, 33 files: `ProfileTabs`, `ProfilePostsView`, `ProfileArticlesView`, `IntellectualFootprint`, `EngagementRow`, rewrites of `[username]/page.tsx` and `lib/profileViewData.ts`). It branches from `c6459ae`, before this branch. | Whether it is the intended Posts and Articles profile (it looks close to S8). `IntellectualFootprint` reintroduces record language. Decide before rewriting the profile a second time. |
| I9 | University and academic identity | `profiles.{university,field_of_study,graduation_year,country}`, `universities` table, `api/universities`, `UniversitySelect` (onboarding, `ProfileGate`, settings), `lib/{academicIdentity,universityDomains}.ts`, `is_university_email`, ranking by university, people suggestions, the university line on every card. | Keep as an optional profile field or remove. It is the campus-network feel in the core flows, but onboarding requires it for students today. |
| I10 | Verification | `profiles.{verified,verified_type}`, `admin/verification`, `20260423000008_messaging_verified_gate.sql`, verified badges in cards and search, ranking input. | Whether a verified badge survives in V1. It is common on publishing platforms, but `verified_type` (student, researcher, faculty, institution) is academic. |
| I11 | Realtime | `lib/realtime.ts` is used by `NotificationBell`, `PostsTable` and `MessageThread`. Supabase Realtime was disabled in `20260521000001`, and [docs/realtime-blocker.md](docs/realtime-blocker.md) covers replacement. | Whether notifications polling is the only survivor, which removes the dependency with messaging. |
| I12 | Onboarding and publish gates | `proxy.ts` redirects Home to `/onboarding` when `onboarding_completed` is false. `ProfileGate` blocks publish until profile fields are set. `guard_onboarding_measurement_fields` trigger on `profiles`. | Minimum fields required to publish under the new model. Existing members mid-onboarding must not be trapped when steps are removed. |
| I13 | Repository vs live catalogue | Four `supabase/pending/` candidates are applied in production without migration files. `scripts/audit/fn-audit.json` (dated 2026-09-07) still lists Debate functions. `20260827000001..3` are in `migrations/` but not applied. | Run `node scripts/migration/measure-supabase.mjs` and `scripts/migration/dump-supabase-schema.sh` before writing any drop migration. Regenerate the audit JSON. |
| I14 | Public URLs, SEO and email links | `sitemap.ts` lists `/campus` and `/opportunities` (and `/research/projects/*` when enabled). Emails and push payloads already sent link to `/fellowships/*`, `/messages/*`, `/responses`, `/publication/*`. `Footer` links Opportunities, Policy Hub, Editorial Standards. | Which removed routes need a permanent redirect rather than a 404. |
| I15 | Feed exposure and reader signals | `lib/feedExposure.ts` (signed impressions, `FEED_EXPOSURE_SIGNING_SECRET`), `impression_dedupe`, `get_reader_affinity`, `record_post_engagement`, `readerSignals.ts`. Ranking v2.1 ([docs/feed-ranking-v2.1.md](docs/feed-ranking-v2.1.md)) depends on them. | Whether V1 Home is ranked at all. If it is chronological plus following, most of this becomes REMOVE. If ranked, it is SIMPLIFY. |

---

## 7. Route Removal Map

Risk: **Low** means self-contained, **Med** means linked from a kept surface or holding public data, **High** means shared with a kept flow. "Gated" means the route calls `notFound()` today.

| Route | Purpose | Dependencies | Gated | Risk |
|---|---|---|---|---|
| `/research`, `/research/profile`, `/research/projects/[slug]`, `/research/proposals/new` | Research hub, researcher profile, project workspace, proposals | `research/layout.tsx`, `lib/research.ts`, `ResearchProjectCard`, `research/actions.ts`, research tables, `api/research-project-assets` | yes (layout) | Low |
| `/submit/research` | Research manuscript submission | `ResearchSubmissionForm`, `CoAuthorPicker`, `PublishingTopicSelector`, `lib/reviewWorkflow.ts`, `api/research-document/upload`, `/write?kind=research` redirect | yes | Low |
| `/review`, `/review/[postId]` | Reviewer queue and review form | `SubmitReviewForm`, `review/actions.ts`, `post_reviews`, `NavUserMenu` link for reviewer roles | yes | Med: legacy policy briefs in flight (I5) |
| `/publication/[citationId]` | Citation archive page | `posts.citation_id`, `api/research-document/[postId]` | yes | Med: public URLs, redirect (I14) |
| `/editorial-standards` | Explains the review process | `Footer`, sitemap | no | Low |
| `/fellowships`, `/fellowships/[id]` | Fellowship listings and application | `lib/{opportunities,opportunityMatch,opportunityReadiness}.ts`, `SaveOpportunityButton`, `OpportunityReadinessCard`, `SponsorBanner`, `FellowshipApply`, `applyActions.ts`, admin digest | no | Low |
| `/opportunities` | Opportunity hub and readiness | same as above plus `OpportunityProfileEditor`, SideRail link, `Footer`, sitemap | no | Low |
| `/talent` | Talent discovery directory | `lib/talentDiscovery.ts`, `talent_profiles` | no | Low |
| `/campus` | Campus hub, cohorts, prompts | `lib/campus.ts`, `CampusPromptLink`, NavClient and SideRail links, Explore `MoreDestinationsCard`, sitemap, composer `?prompt=` | no | Med: primary nav and composer |
| `/ambassadors`, `/ambassadors/apply`, `/ambassadors/dashboard` | Ambassador programme | `lib/campus.ts`, `AmbassadorActivityForm`, `CampusPromptLink`, `Footer` (flagged) | no | Low |
| `/alumni` | Alumni directory | `profiles.is_alumni` | no | Low |
| `/partners` | Institutional partner outreach | `PartnerContactForm`, `api/partner-contact`, `institutional_partners` | no | Low |
| `/policy` | Policy brief hub | `policy_briefs_featured`, `SponsorBanner`, `FeaturePolicyButton`, `Footer` | no | Low |
| `/leaderboard` | Points ranking and badges | `profiles.points`, `user_badges`, `PointsTierBadge`, `SponsorBanner`, HomeSidebar "See all" | no | Low |
| `/stats` | Points and subscriber stats | `lib/publicationDistribution.ts`, `PointsTierBadge`, proxy protected list | partial | Low |
| `/responses` | Recent responses list | `fetchRecentResponsePage`, BottomNav, NavClient, SideRail, Explore rail | no | Med: primary nav |
| `/messages`, `/messages/[id]` | Inbox and thread | `ConversationListClient`, `MessageThread`, `api/messages/*`, `MessagesUnreadBadge` (NavClient, SideRail), profile Message button, `lib/realtime.ts` | no | Med: nav and profile |
| `/subscriptions` | Subscription manager | `SubscriptionsManagerClient`, `topicActions` | redirects when flag off | Low |
| `/[username]/record` | Full Intellectual Record | `lib/profileRecordData.ts`, `ProfileRecordCard`, `EvidenceLegend`, profile "View full record", identity panel metrics | no | Med: profile links |
| `/draft/[token]` | Unlisted draft preview | `post_draft_shares`, `DraftShareControl` | token | Low |
| `/r/p/[token]` | Publication delivery click-through | `publication_deliveries` | flag | Low |
| `/dev-preview/feed` | Feed design fixtures | `lib/devFixtures/homeFeedFixtures.ts` | yes (production) | Low |
| `/admin/research` | Research expansion targets | `ResearchTargetsForm`, `get_research_expansion_metrics` | yes | Low |
| `/admin/review` | Editorial queue, reviewer assignment, featuring | `lib/reviewWorkflow.ts`, `editorialTrust`, `postQuality`, `profileCredibility`, `api/audio-summary` trigger, `publicationDistribution` | no | Med: also features posts for Home (R19) |
| `/admin/fellowships` | Fellowship CRUD and applications | `FellowshipForm`, `ApplicationActions`, `lib/applicationReview.ts` | no | Low |
| `/admin/ambassadors`, `/admin/campuses` | Programme operations | `lib/campus.ts`, campus forms | no | Low |
| `/admin/sponsors`, `/admin/partners` | Sponsor placements, partner records | forms and toggles | no | Low |
| `/admin/digest` | Manual digest email | `DigestSendButton`, reads `fellowships` and `campus_editorial_prompts` | no | Low |
| `/admin/verification` | Verification queue | `VerificationActions` | no | see I10 |

Routes that stay but change role: `/me` (S13), `/discover` and `/create/post` (cheap redirects, keep), `/dashboard` (S12), `/settings/profile` (S9).

---

## 8. Component Removal Map

Production importers counted from the import graph after Phase 1 cleanup. A component listed here with an importer outside its own feature is marked so the importer is edited in the same change.

| Component | Feature | Imported by (production) |
|---|---|---|
| `components/research/ResearchProjectCard.tsx` | R1 | `research/page.tsx` |
| `components/topic/PublishingTopicSelector.tsx` | R1, R21 | `submit/research/ResearchSubmissionForm.tsx` |
| `components/editorial/EditorialTrustPanel.tsx` | R2 | `dashboard/page.tsx`, **`post/[slug]/page.tsx`** |
| `app/(main)/edit/[slug]/EditForm.tsx` | R2 | **`edit/[slug]/page.tsx`** (non-draft, non-published branch only) |
| `components/opportunities/OpportunityReadinessCard.tsx` | R3 | **`dashboard/page.tsx`**, `fellowships/[id]`, `opportunities` |
| `components/opportunities/{OpportunityProfileEditor,SaveOpportunityButton,opportunityActions}` | R3 | opportunity and fellowship routes |
| `components/profile/ContactInquiryModal.tsx` | R3 | **`components/profile/ProfileHeader.tsx`** |
| `components/campus/CampusPromptLink.tsx` | R4 | `campus/page.tsx`, `ambassadors/dashboard/page.tsx` |
| `components/ui/SponsorBanner.tsx` | R7 | `fellowships`, `leaderboard`, `policy` |
| `components/post/ResponseStartLink.tsx` | R9 | **`notifications/NotificationItem.tsx`**, **`post/[slug]/{PublishedToast,ReadingBar}.tsx`**, `CollaborationPanel`, `CredibilityPanel` |
| `app/(main)/post/[slug]/InlineResponseComposer.tsx` | R9 (promote path only) | **`post/[slug]/DiscussionSection.tsx`**. It is also the comment box, so cut the promote branch, do not delete |
| `app/(main)/post/[slug]/DiscussionSection.tsx` | R9 (responses half) | **`post/[slug]/page.tsx`**, **`PostConversationView.tsx`** |
| `components/profile/ProfileRecordCard.tsx` | R10 | **`[username]/page.tsx`**, `[username]/record/page.tsx` |
| `components/profile/{EvidenceLabels,EvidenceLegend}.tsx` | R10, R12 | **`[username]/page.tsx`**, `record/page.tsx`, **`FeaturedWork.tsx`**, **`ProfileIdentityPanel.tsx`** |
| `components/profile/ProfilePreview.tsx` | R10, S9 | **`settings/profile/ProfileCommandCenter.tsx`** |
| `components/ui/IntellectualRecordWelcome.tsx` | R10 | **`explore/page.tsx`** |
| `components/ui/PointsTierBadge.tsx` | R11 | `leaderboard`, `stats` |
| `components/post/CredibilityPanel.tsx` | R12 | **`post/[slug]/page.tsx`** (research branches only) |
| `app/(main)/dashboard/QualitySignals.tsx` | R12 | **`dashboard/page.tsx`** |
| `app/(main)/post/[slug]/{CiteThis,CopyCitationIdButton}.tsx` | R13 | **`post/[slug]/page.tsx`** |
| `components/ui/MessagesUnreadBadge.tsx` | R14 | **`NavClient.tsx`**, **`SideRail.tsx`** |
| `app/(main)/messages/{ConversationListClient,[id]/MessageThread}.tsx` | R14 | messages routes |
| `components/collaboration/CoAuthorPicker.tsx` | R15 | **`UniversalComposer.tsx`**, `submit/research/*` |
| `components/collaboration/CollaborationPanel.tsx` | R14, R15 | **`post/[slug]/page.tsx`** |
| `components/collaboration/CollaborationDashboardCard.tsx` | R15 | **`dashboard/page.tsx`** |
| `components/post/AudioSummaryPlayer.tsx` | R16 | **`post/[slug]/page.tsx`** |
| `components/push/{PushPromptBanner,usePushNudge}` | R17 | **`app/(main)/page.tsx`** |
| `components/ui/WelcomeBanner.tsx` | R17 | **`app/(main)/page.tsx`** |
| `components/ui/ActivationBanner.tsx` | R17 | none (test only) |
| `app/(main)/ContinueDraftRow.tsx` | R19 | none (test only) |
| `components/retention/RetentionThisWeek.tsx` | R17 | **`dashboard/page.tsx`** |
| `components/notifications/ActionInboxPanel.tsx` | S7, S12 | **`dashboard/page.tsx`** |
| `components/ui/{HomeSidebar,BriefColumn}.tsx` | R19 | **`app/(main)/page.tsx`**, `dev-preview/feed` |
| `components/post/{PeopleInterlude,TopicInterlude}.tsx` | R19 | **`components/post/PostFeed.tsx`**, `dev-preview/feed` |
| `components/post/{HomeFeaturedLead,HomeFeaturedLeadImpression}.tsx` | R19 | **`PostsFeedSection.tsx`**, **`PostsFeedTabs.tsx`**, `dev-preview/feed` |
| `components/topic/{TopicSubscribeButton,topicActions}.tsx` | R20 | **`explore/ExploreTopicsGrid.tsx`**, **`topics/TopicsClient.tsx`**, **`topics/[tag]/page.tsx`**, settings and subscriptions managers |
| `components/profile/{AuthorRelationshipControlsV2,AuthorRelationshipProvider}.tsx` | R20 | **`AuthorRelationshipControls.tsx`**, **`post/[slug]/page.tsx`**, **`ViewTracker.tsx`** |
| `app/(write)/write/DraftShareControl.tsx` | R22 | **`UniversalComposer.tsx`** |
| `app/(main)/explore/MobileOpportunitiesBanner.tsx` | R3 | **`explore/page.tsx`** |
| `settings/profile/sections/{ResearchSection,OpportunitiesSection,OutcomesSection}.tsx` | R1, R3 | **`ProfileCommandCenter.tsx`** |
| `app/(main)/settings/ProfileForm.tsx` | S9 | none, but read as text by `lib/onboardingIdentityAlignment.test.ts`, so delete with that assertion |

Bold importers are KEEP or SIMPLIFY surfaces that must be edited in the same change.

---

## 9. API / Server Removal Map

### Route handlers

| Endpoint | Feature | Callers | Notes |
|---|---|---|---|
| `POST /api/audio-summary` | R16 | `admin/review/actions.ts:322`, `write/actions.ts:1356` (inside dead `publishPost`) | Claude plus Google TTS, writes bucket `audio-summaries` |
| `POST /api/research-document/upload`, `GET /api/research-document/[postId]` | R1 | `submit/research`, links in post, admin review, publication pages | bucket `research-documents` |
| `POST /api/research-project-assets/upload`, `GET .../[assetId]` | R1 | research project workspace | bucket `research-project-assets` |
| `GET /api/messages/[id]/poll`, `GET /api/messages/unread` | R14 | `MessageThread`, `MessagesUnreadBadge` | |
| `POST /api/partner-contact` | R7 | `partners/PartnerContactForm.tsx` | `contact_requests` |
| `POST /api/topic-suggestions` | R21 | `PublishingTopicSelector` | Gemini, quota RPC |
| `GET /api/universities` | I9 | `UniversitySelect` (onboarding, settings, `ProfileGate`) | depends on the I9 decision |
| `GET /api/cron/daily-brief` | R18 | Supabase job `indegenius-daily-brief` | sends push |
| `GET /api/cron/review-reminders` | R2 | Supabase job `indegenius-review-reminders` | |
| `GET /api/cron/process-publication-deliveries` | R20 | Supabase job `indegenius-publication-recovery` | no-op while flag off |
| `GET /r/p/[token]` | R20 | delivery emails | |
| `POST /api/activation` | S15 | `lib/activationEvents.ts`, imported by 38 modules | keep with a reduced vocabulary |
| `GET /api/posts/[slug]/impression` | I15 | `lib/useViewImpression.ts` | depends on ranking decision |

Removing a cron job means editing all four private functions in `20260827110918_migrate_scheduler_to_supabase_cron.sql` and re-running `private.install_indegenius_cron_jobs()`, as `20260906000003_remove_debate_cron_jobs.sql` did. The `promote-alumni` job is scheduled directly with `cron.schedule` in `20260423000007` and is separate from that set.

### Server actions and server modules

| Module | Feature |
|---|---|
| `app/(main)/research/actions.ts`, `submit/research/actions.ts`, `admin/research/actions.ts`, `lib/research.ts` | R1 |
| `review/actions.ts`, `admin/review/actions.ts`, `edit/[slug]/actions.ts`, `lib/reviewWorkflow.ts`, `lib/editorialTrust.ts`, `lib/citationId.ts`, `write/actions.ts#withdrawSubmission` | R2, R13 |
| `admin/fellowships/actions.ts`, `fellowships/[id]/applyActions.ts`, `components/opportunities/opportunityActions.ts`, `components/profile/opportunityInquiryActions.ts`, `dashboard/opportunityInquiryActions.ts`, `settings/profile/outcomeActions.ts`, `lib/{opportunities,opportunityMatch,opportunityReadiness,talentDiscovery,applicationReview,profileCredibility,contactRequests}.ts` | R3, R7 |
| `admin/campuses/actions.ts`, `ambassadors/{apply,dashboard}/actions.ts`, `admin/ambassadors/actions.ts`, `lib/campus.ts`, `write/actions.ts#validateCampusPrompt` | R4, R5 |
| `admin/sponsors/actions.ts`, `admin/partners/actions.ts`, `policy/actions.ts` | R7, R8 |
| `lib/responsePost.ts`, response functions in `lib/feedData.ts` | R9 |
| `lib/{intellectualRecord,profileRecord,profileRecordData,profileRecordMetrics}.ts`, `lib/db/profileRecord.ts` | R10 |
| `lib/{credibilityGraph,credibilityGraphData,demonstratedExpertise}.ts` | R12 |
| `messages/[id]/actions.ts`, `lib/{conversationActions,messagingEligibility}.ts`, `lib/db/messaging.ts` | R14 |
| `lib/collaboration.ts`, `lib/db/collaboration.ts`, `write/actions.ts#{syncAuthors,syncDraftAuthors}` | R15 |
| `lib/{activation,retention,profileNextAction,pushPromptPolicy,pushNudgeStorage}.ts`, `admin/analytics/actions.ts` (profile reminder) | R17 |
| `admin/digest/actions.ts`, `lib/dailyBrief.ts` | R18 |
| `lib/{publicationDelivery,publicationDistribution}.ts`, `components/topic/topicActions.ts`, `followActions.setAuthorSubscription` | R20 |
| `lib/{geminiTopicSuggestions,topicSuggestions}.ts` | R21 |
| `(write)/write/shareActions.ts` | R22 |
| `lib/liteMode.ts` | R23 |
| `write/actions.ts#{ensureDraft,publishPost,savePostReferences}` | R24 |

`lib/db` repositories touched: `collaborationRepository`, `messagingRepository`, `profileRecordRepository`, and the research, citation and audio fields in `postPageRepository` and `lib/db/postgres/posts.ts`. Each has a Supabase and a Postgres implementation, parity fields in `lib/db/parity.ts`, and entries in `scripts/migration/read-registry.mjs` (I7).

### Analytics events tied only to removed features

Of the ~100 names in `lib/activationEvents.ts`, at least these belong to removed systems: `ai_topic_suggestion_*` (4), `ambassador_*` (2), `author_subscription_*` (4), `campus_*` (3), `coauthor_*` (4), `collaboration_*` (2), `fellowship_*` (2), `message_*` (2), `opportunity_*` (16), `profile_brief_*` (5), `profile_expertise_topic_opened`, `profile_inquiry_*` (2), `profile_recognition_*` (2), `push_nudge_*` (2), `quality_check_*` (2), `research_*` (10), `next_action_clicked`, `profile_next_action_clicked`. Historic `activation_events` rows stay; only the emitters go.

---

## 10. Database Impact Map

**Nothing here is to be dropped in Phase 1.** The lists are candidates for later migrations written in the shape of `20260906000004_remove_debate_schema.sql`: export block first, redefine shared objects, then drop, inside one transaction, with a contract test.

There are **no Postgres enum types**. Every constrained value is a `text` column with a `CHECK` (for example `posts.type`, `posts.content_kind`, `posts.article_format`, `posts.status`), so removing a value is a constraint change plus a data migration.

### 10.1 Tables

| Feature | Tables | Policies (repo replay) |
|---|---|---|
| R1 Research | `researcher_profiles`, `research_projects`, `research_project_members`, `research_project_updates`, `research_project_assets`, `research_project_events`, `research_collaboration_requests`, `research_expansion_targets` | 17 |
| R2 Review | `post_reviews`, `post_editor_decisions`, `submission_tracks`, `post_versions` (I5) | 10 |
| R13 Citation | `citation_sequences` | 1 |
| R3 Opportunities | `fellowships`, `fellowship_applications`, `saved_opportunities`, `talent_profiles`, `talent_inquiries`, `opportunity_outcomes`, `opportunity_outcome_events` | 16 |
| R4, R5 Campus, ambassadors | `campus_programs`, `campus_cohorts`, `campus_cohort_memberships`, `campus_editorial_prompts`, `campus_prompt_submissions`, `campus_ambassadors`, `campus_ambassador_activity` | 11 |
| R7, R8 Sponsors, partners, policy, webinars | `sponsor_placements`, `institutional_partners`, `contact_requests`, `policy_briefs_featured`, `webinars`, `webinar_attendees`, `webinar_questions` | 17 |
| R11 Gamification | `badges`, `user_badges` | 2 |
| R14 Messaging | `conversations`, `conversation_participants`, `messages` | 6 |
| R15 Co-authors | `post_authors` (I4) | 5 |
| R17 Retention | `user_activity_days` | 1 |
| R20 Subscriptions | `author_subscriptions`, `author_subscription_events`, `topic_subscriptions`, `publication_events`, `publication_deliveries` | not in replay (pending files) |
| R21 AI | `ai_topic_suggestion_quotas` | not in replay |
| R22 Draft shares | `post_draft_shares` | 1 |
| I9 Academic identity | `universities` | 1 |
| I12 Onboarding | `user_onboarding_preferences` | 3 |

Views: `profile_record_entries` (R10), `public_review_signals` (R2, R12), `public_citation_edges` (R12, R13), `public_opportunity_outcomes` (R3), `profile_directory` (kept for people search, check columns).

Storage buckets: keep `avatars` and `post-images`. Remove candidates: `research-documents`, `research-project-assets`, `audio-summaries`. Objects are not to be deleted in any phase until I5 is decided.

### 10.2 Columns on kept tables

| Table | Candidate columns | Feature |
|---|---|---|
| `posts` | `citation_id`, `published_version_id`, `current_round`, `revision_due_at` | R2, R13 |
| `posts` | `document_path`, `document_original_name`, `document_mime_type`, `document_size_bytes`, `pdf_url` | R1 |
| `posts` | `audio_summary_url` | R16 |
| `posts` | `in_response_to` | R9 (I5) |
| `posts` | `featured` | R19 |
| `posts` | `research_keywords` | R21 |
| `posts` | `type` (make derived or nullable), `article_format` | I1, R8 |
| `posts` | `impression_count`, `read_count` | I15 |
| `profiles` | `points` | R11 (I2) |
| `profiles` | `is_alumni`, `open_to_mentoring`, `graduation_year` | R6 (I9) |
| `profiles` | `university`, `field_of_study`, `country` | I9 |
| `profiles` | `verified`, `verified_type` | I10 |
| `profiles` | `profile_type`, `secondary_profile_types`, `organization_name`, `organization_website`, `professional_title`, `positioning_statement` | S21 |
| `profiles` | `push_prompt_attempt_count`, `push_prompt_last_shown_at`, `push_prompt_shown_at`, `last_engagement_push_notified_at` | R17 |
| `profiles.notification_prefs` (JSONB keys) | `email_review_assigned`, `email_review_started`, `email_review_reminder`, `email_co_author_invite`, `email_co_author_accepted`, `email_co_author_declined`, `email_opportunity_inquiry`, `email_author_publications`, `email_responses`, `email_messages`, `email_profile_reminders` | R2, R15, R3, R20, R9, R14, R17 (I6) |
| `notifications` (rows by `type`) | `review_assigned`, `review_started`, `review_reminder`, `revision_requested`, `post_approved`, `post_rejected`, `fellowship`, `response_post`, `opportunity_inquiry`, `co_author_invite`, `co_author_accepted`, `co_author_declined`, `research_collaboration_*` (3), `author_published`, `topic_published`, `author_subscribed`, `badge` | I6 |
| `opportunity_applications.outcome_verified_at` | documented as not applied | R12 |

### 10.3 Triggers

Triggers on **kept** tables that belong to removed features. These are the risky ones (I2).

| Table | Trigger | Function | Feature |
|---|---|---|---|
| `posts` | `on_post_published_points` | `award_points_on_publish` | R11 |
| `posts` | `on_post_published_badges` | `check_and_award_badges` | R11 |
| `posts` | `on_post_approved` | `notify_post_approved` | R2 |
| `posts` | `guard_locked_post_write` | `guard_locked_post_write` | R2 (I1) |
| `posts` | `posts_sync_content_classification` | `sync_post_content_classification` | I1, keep until `type` is resolved |
| `likes` | `on_like_points`, `on_like_delete_points` | `award_points_on_like`, `reverse_points_on_unlike` | R11 |
| `comments` | `on_comment_points` | `award_points_on_comment` | R11 |
| `profiles` | `on_points_updated` | `check_points_badges` | R11 |
| `profiles` | `profiles_assign_selected_campus_cohort` | `assign_profile_to_selected_campus_cohort` | R4 |
| `post_authors`, `post_references` | `guard_locked_post_*_write` | `guard_locked_post_child_write` | R2 (I4) |

Triggers on removed tables go with their tables: `guard_post_review_submission` and `on_review_submitted_points` (`post_reviews`), five `research_*` guards and initialisers, `fellowships_touch_updated_at`, `talent_inquiries_touch_updated_at`, `messages_enforce_soft_delete`, `messages_touch_conversation_last_message`.

Kept triggers on kept tables, for contrast: like and bookmark counts, `post_references_sync_count`, `posts_seed_aggregate_counts`, `posts_sync_topic_keys`, `posts_touch_updated_at`, `posts_word_count_trg`, `notify_on_like`, `notify_on_follow`, `notify_on_comment` (and their older `notify_post_*` twins, I6), `profiles_broadcast_resubscribe`, `profiles_protect_privileged_columns*`, `profiles_guard_onboarding_measurement_fields` (I12).

### 10.4 Functions

| Feature | Functions |
|---|---|
| R1 Research | `is_valid_research_text_array`, `can_access_research_project`, `can_contribute_research_project`, `guard_research_project_write`, `initialize_research_project`, `record_research_project_change`, `guard_researcher_profile_write`, `guard_research_project_update_write`, `guard_research_project_asset_write`, `get_research_expansion_metrics` |
| R2, R13 Review, citation | `is_post_reviewer`, `is_editor_or_admin` (check other callers), `generate_citation_id`, `withdraw_post_submission`, `guard_post_review_submission`, `award_points_on_review_submission`, `notify_post_approved`, `is_legacy_policy_brief_in_flight`, `guard_locked_post_write`, `guard_locked_post_child_write`, `is_post_editable` |
| R3 Opportunities | `touch_fellowships_updated_at`, `touch_talent_inquiries_updated_at`, `can_verify_opportunity_outcome`, `submit_opportunity_outcome`, `verify_opportunity_outcome`, `set_opportunity_outcome_visibility`, `dispute_opportunity_outcome`, `revoke_opportunity_outcome` |
| R4 to R6 Campus, alumni | `promote_alumni`, `assign_profile_to_selected_campus_cohort`, `backfill_selected_campus_cohort_memberships`, `get_campus_candidates`, `get_campus_cohort_metrics`, `is_university_email` (I9) |
| R10, R12 Record, credibility | `get_public_profile_record_summary`, `get_public_profile_record_summary_v2`, `get_public_credibility_summary` |
| R11 Gamification | `award_points_on_publish`, `award_points_on_like`, `award_points_on_comment`, `reverse_points_on_unlike`, `check_and_award_badges`, `check_points_badges` |
| R14 Messaging | `find_or_create_conversation`, `can_send_message_in_conversation`, `touch_conversation_last_message`, `enforce_message_soft_delete` |
| R15 Co-authors | `is_post_coauthor` (I4), `create_research_collaboration_request`, `respond_research_collaboration_request` |
| R17 Retention | `record_user_activity_day`, `get_phase0_measurement_baseline` |
| R20 Subscriptions | `set_author_relationship`, `set_author_relationship_v2`, `remove_author_subscriptions_for_block`, `capture_first_publication_event`, `capture_author_subscription_event`, `claim_publication_events`, `claim_publication_event_for_post`, `claim_publication_deliveries`, `renew_publication_event_lease`, `renew_publication_delivery_lease`, `list_my_author_subscriptions`, `list_my_topic_subscriptions`, `get_subscription_feed_candidates`, `set_topic_subscription` |
| R21 AI | `claim_ai_topic_suggestion_quota` |
| R20 (kept for topics) | `normalize_topic_key`, `derive_post_topic_keys`, `sync_post_topic_keys` stay: they back `posts.topic_keys` for topic pages |

Several of these have parameterised replacements from `20260909000001` and `20260910000001` (the identity RPC work). A drop must cover every overload.

---

## 11. Publishing Model Assessment

### 11.1 Data model

Posts, Articles, Research and Responses all live in one table, `posts`. A kind is not a table.

| Column | Values | Written by | Read by |
|---|---|---|---|
| `type` (legacy, `NOT NULL`) | `blog`, `essay`, `policy_brief`, `research` | `legacyTypeForNewContent()`: new Post writes `blog`, new Article writes `essay` | 10+ queries via `RESEARCH_TYPE_QUERY_EXCLUSION`, lock guards, `EditForm` branch, sitemap |
| `content_kind` | `post`, `article`, `research` | `derivePresentationClassification()` from title presence | `resolveContentKind()` everywhere (41 importers of `lib/contentModel.ts`) |
| `article_format` | `essay`, `policy_brief`, null | legacy only; new Articles write null | Explore genre filter, card badges, `resolveArticleFormat()` |
| `title` | nullable | composer | `posts_title_required_unless_post_check` requires it only for research |
| `in_response_to` | parent post id | composer `?inResponseTo=` / `?response_to=`, comment promote | Responses sections, `/responses`, parent link |
| `status` | `draft`, `pending`, `pending_revision`, `published`, `rejected`, `removed`, `withdrawn` | `publishOwnDraft` for Post and Article, review workflow for the rest | everywhere |

Mapping as implemented: `blog → post`, `essay → article/essay`, `policy_brief → article/policy_brief`, `research → research`. A Response is not a kind: it is any Post or Article with `in_response_to` set.

`contentKindRequiresFormalReview()` is true only for `research`. Posts and Articles publish immediately. `pending` and `pending_revision` exist only for research and for legacy policy briefs caught mid-review (`isLegacyPolicyBriefInFlight`).

### 11.2 Assessment

The target model ("no title is a Post, a title is an Article") is **already implemented** at both layers: `derivePresentationClassification()` in the composer and `effective_content_kind()` plus the title constraint in the database. Phase 2 does not need a new architecture, only subtraction:

1. Remove research and review so `status` collapses to `draft | published | removed` for new content (existing `pending` and `rejected` rows are I5).
2. Stop reading `article_format` in the UI. Keep the column until I1 decides it.
3. Treat `type` as a compatibility column: keep dual-writing `blog` and `essay` until a migration makes it derived, then drop the research exclusion sentinel.
4. Remove `in_response_to` writes. Decide what existing responses display as (I5).

Do not rename `content_kind` values or merge tables. The two-value model fits the existing column.

### 11.3 Composer audit (`/write`)

| Aspect | Current implementation |
|---|---|
| Content type selection | None exposed. `derivePresentationClassification(title)` decides on save. `/write?kind=research` and `?type=research` redirect to `/submit/research`. |
| One composer for Post and Article | Yes. `UniversalComposer` serves `new`, `draft` and `published-edit` modes. `/create/post` redirects to `/write`. `/edit/[slug]` uses `UniversalComposer` for published Posts and Articles, and the legacy `EditForm` only for pending, revision or rejected research and policy briefs. |
| Title and subtitle | Body-first canvas. "Add title" reveals the title field. The subtitle (`excerpt`) is offered only under a title, and removing the title clears both. Unwritten subtitles are derived from the body for the feed. |
| Drafts | Local recovery copy in `localStorage` plus cloud draft via `ensureContributionDraft` once `deservesCloudDraft()` (5 words or 25 characters, or a title). `MyDrafts` panel. Abandoned scraps hidden after 7 days. |
| Autosave | Debounced cloud persist with revision counter and conflict detection ("changed in another window"). |
| Revision history | `record_post_revision()` on every autosave, throttled to one per 3 minutes, pruned to 40. `RevisionHistory` restore UI. Drafts only. |
| Published edits | `post_edit_drafts` holds the pending edit; `apply_post_edit_draft` publishes it. Discard supported. |
| Images and media | Tiptap `CaptionedImage` (figure and figcaption), paste and drop upload, cover image in publish drawer via `CoverImageUploader` to `post-images`. |
| Topics | `TagInput` in the publish drawer, max 5, normalised by `lib/tags.ts`, `topic_keys` synced by trigger. |
| References and sources | `ReferencesPanel` in the canvas drawer, `insertCitation` puts `[ref:id]` markers in the body, `validateCitationReferences` checks markers against references, `syncReferences` writes `post_references`. |
| Collaborators | `CoAuthorPicker` in the drawer (new and draft modes). `syncDraftAuthors` on autosave, `syncAuthors` on publish sends `co_author_invite` notifications and email. **R15.** |
| AI tools | None in `/write`. AI topic suggestions exist only in the research submission form. Audio summary generation is triggered only by editorial acceptance and by the dead `publishPost`. **R16, R21.** |
| Publishing status and visibility | Publish drawer: preview, topics, cover, "Publish now". `publishOwnDraft` sets `published`. No visibility options (public only), no unlisted mode except draft share links. |
| Draft sharing | `DraftShareControl` creates an unlisted token in `post_draft_shares`, rendered at `/draft/[token]`. **R22.** |
| Scheduling | None. |
| Responses integration | `parent` prop from `?inResponseTo=` or `?response_to=`, banner "Responding to", `validateResponseParent`, `notifyResponseParentAuthor` on publish. Comment box promote path creates a response draft. **R9.** |
| Campus integration | `?prompt=` loads a campus editorial prompt, validated against cohort membership, inserts `campus_prompt_submissions` on publish. **R4.** |
| Research integration | Redirect only, plus refusal in `ensureContributionDraft` for research drafts. **R1.** |
| Gates | `ProfileGate` before the publish drawer when profile fields are missing (I12). `requireNotSuspended`. |
| Side effects on publish | `revalidatePath` x3, `schedulePublicationDistribution` (no-op while subscriptions flag off), `recordActivationEvent("post_submitted")`, points and badge triggers in the database. |

Dead weight in `write/actions.ts`: `ensureDraft`, `publishPost` and `savePostReferences` (lines ~682 to ~1395) are the pre-universal typed composer. They have no production caller and are exercised only by `actions.test.ts`.

---

## 12. Feed Assessment

### 12.1 What renders on Home (`/`)

Signed-out visitors are redirected to `/landing` unless `?guest=1`.

| Region | Element | Class |
|---|---|---|
| Above feed | `WelcomeBanner` (`?welcome=1`) | Clutter (R17) |
| Above feed | `PushPromptBanner` (signed in, policy-driven) | Clutter (R17) |
| Above feed | `RetentionEventTracker home_viewed` | Instrumentation (S15) |
| Above feed | `HomeGuestNotice` (guests) | Keep, simplify copy |
| Tab strip | For you, Following, Subscribed (flag), Topics (flag), Latest | Too many modes. Subscribed and Topics are R20 |
| Tab strip | subscription source chips (All, Authors, Topics) | Clutter (R20) |
| Feed head | `HomeFeaturedLeadImpression`: editor's pick, recommended, or latest, with provenance label | Clutter (R19) |
| Feed | `HomeFeedCardImpression` per post: Post, Article or Research card, author, university, co-author count, quality reason, like, discussion count (comments plus responses), share, bookmark | **Publication content**. Simplify card metadata |
| Feed inserts (mobile, below `lg`) | `PeopleInterlude` and `TopicInterlude` after posts 3, 7 and 11 | Clutter (R19) |
| Feed foot | infinite scroll, `EndStateCard`, pagination retry | Keep |
| Sidebar (`lg` and up) | "Your intellectual brief" header | Clutter (R19) |
| Sidebar | Continue draft card **or** activation checklist card | Draft card could move to the composer. Activation card is R17 |
| Sidebar | "Featured today" (second featured candidate) | Clutter (R19) |
| Sidebar | "Writers to follow" (3), "See all" goes to `/leaderboard` | Clutter, broken destination (R11, R19) |
| Sidebar | "Explore topics" chips (interest-weighted plus 10 hardcoded academic topics) | Clutter (R19) |

Not currently on Home, contrary to what the brief anticipated: opportunity cards, research content (hidden by `FEATURE_FLAGS.research` in `HomeFeedCard`), campus content and sponsored content. Those live on Explore, `/fellowships`, `/leaderboard` and `/policy`.

### 12.2 Why it is heavy

- **Query fan-out.** `app/(main)/page.tsx` runs 9 queries in parallel (profile, follows, recent draft, three featured-candidate queries, topic subscriptions, author subscriptions, private profile RPC, onboarding RPC, blocked authors), then blocked co-author check and engagement counts, then suggested people and activation state, then the feed. The layout adds a profile read and `record_user_activity_day` on every navigation.
- **Ranking weight.** The featured lead alone is quality-scored with `scorePost()` and `getFeedSurfaceReason()` using reference, response and bookmark counts, citation IDs and published version IDs. `fetchFeedPage` ranks a 120-post window with evergreen, well-read and reviewed arms.
- **Parallel plumbing kept for removed controls.** `PostsFeedTabs` still threads `typeFilter` and `timeframe` through state, URL sync and cache keys, while a 20-line comment explains Home never sets either.
- **Duplicated empty states.** `PostsFeedTabs` and `PostFeed` each render their own per-tab empty states.

### 12.3 Target

One publication feed with at most two modes (For you and Following, or Following and Latest, decided by I15), no lead, no interludes, no sidebar or a single quiet sidebar, and no banners. Most of this is deletion inside `page.tsx`, `PostsFeedSection.tsx`, `PostsFeedTabs.tsx` and `PostFeed.tsx`.

---

## 13. Navigation Assessment

### 13.1 Current

| Shell | Breakpoint | Destinations |
|---|---|---|
| Brand bar (`NavClient`, above nav) | all | "Africa's First Intellectual Social Network" tagline |
| Top bar (`NavClient`) | `md` to `xl` | For you, Discover, Responses, Campus, (Research if flag), Search field (`lg`+), Messages icon, Notification bell, Create, account menu |
| Top bar | `xl` | Wordmark, Search, Messages icon, Notification bell, Create, account menu (links move to the rail) |
| Top bar | mobile | Wordmark, Notification bell, Create button. Messages icon hidden when the bottom nav shows |
| Side rail (`SideRail`) | `xl` | For you, Discover, Responses, Campus, (Research), My record · divider · Opportunities, Bookmarks, Messages, Publish button |
| Bottom bar (`BottomNav`) | below `md` | For you, Discover, Responses, Record (or Join) plus floating Create FAB |
| Account menu (`NavUserMenu`) | `md`+ | header "Intellectual Record", Intellectual Record, Writing dashboard, Review (reviewers), Bookmarks, Settings, Admin, Sign out |
| `/me` hub | mobile Record target | My writing, Bookmarks, Settings, Review, Admin |

Problems: three shells with three destination lists; Campus, Responses, Opportunities and Messages are primary; Notifications is not a destination anywhere (bell only); Search is a field at `lg` and absent from mobile chrome except via Discover; "Record" is the label for Profile.

The shared plumbing is good and should stay: `NAV_MATCH_PREFIXES` and `isNavItemActive()` in `navItems.tsx`, `shouldShowMobilePrimaryNav()` and `shouldShowDesktopRail()` in `navRoutes.ts`, `AppChromeProvider` scroll behaviour, and `CreateLauncher` or `CreateTrigger` for the guest auth gate.

### 13.2 Migration path

| Target | Route | Existing support | Change |
|---|---|---|---|
| Home | `/` | `HomeIcon`, `NAV_MATCH_PREFIXES.home` | Relabel "For you" to Home |
| Explore | `/explore` (with `/discover`, `/search`, `/topics` folded into its active prefixes) | `ExploreIcon`, `NAV_MATCH_PREFIXES.explore` | Relabel "Discover" to Explore; add `/search` and `/topics` prefixes |
| Write | `/write` | `CreateLauncher` (FAB, desktop button), `CreateTrigger` (rail) | Make it a nav destination in the bar rather than a floating FAB; keep the guest gate |
| Notifications | `/notifications` | `NotificationBell` (panel), `/notifications` page | Add a nav item with the unread count the bell already computes; add a prefix |
| Profile | `/${username}` (signed in), `/signup` (guest) | `ProfileIcon`, `isAccountNavActive()` | Point at the profile rather than `/me`; keep Settings, Bookmarks, Dashboard and Sign out in the account menu |

Concrete edits for Phase 2: delete `ResponsesIcon`, `CampusIcon`, `ResearchIcon`, `OpportunitiesIcon`, `MessagesIcon` and their prefix keys from `navItems.tsx`; make `BottomNav` and `SideRail` read one five-item array; remove the Messages icon and `MessagesUnreadBadge` from `NavClient`; replace "Intellectual Record" labels in `NavUserMenu`; drop `/messages` from `RAIL_SUPPRESSED_PREFIXES` and `/submit/research` from `MOBILE_FOCUS_ROUTE_PREFIXES`. Bookmarks moves into the account menu (it already is there on desktop).

---

## 14. Profile Assessment

### 14.1 Current `/[username]`

| Section | Source | Classification |
|---|---|---|
| Cover, avatar, name, username | `ProfileHeader`, `ProfileIdentityPanel` | KEEP |
| Bio | `ProfileIdentityPanel` | KEEP |
| Headline derived from `profile_type`, title, organization, university | `lib/profileIdentity.ts` | SIMPLIFY (S21, I9) |
| Positioning statement | `profiles.positioning_statement` (flag) | SIMPLIFY or REMOVE (S21) |
| Verified badge | `verified`, `verified_type` | INVESTIGATE (I10) |
| Followers and following counts, links | `viewer.followerCount`, `[username]/followers` | KEEP |
| Follow button (with subscribe when flag on) | `AuthorRelationshipControls` | KEEP follow, REMOVE subscribe (I3) |
| Message button (eligibility-gated) | `openConversationWith` | REMOVE (R14) |
| "Open to opportunities" availability, contact inquiry modal | `opportunity` state, `ContactInquiryModal` | REMOVE (R3) |
| Share, Report, Block | `ShareButton`, `ReportButton`, `BlockUserButton` | KEEP |
| Record metrics strip (publications, citable, reviewed, source-backed) | `getLinkedProfileRecordMetrics` | REMOVE (R10), replace with plain counts if wanted |
| Demonstrated topics chips | `deriveDemonstratedTopics` | SIMPLIFY to topics the person writes about |
| Sticky follow bar | `ProfileStickyBar` | SIMPLIFY (keep follow only) |
| Section nav (Featured, Record, Background) | `ProfileSectionNav` | REPLACE with Posts and Articles tabs |
| Featured Work with evidence legend, notes, manager | `FeaturedWork`, `FeaturedWorkManager`, `EvidenceLegend` | SIMPLIFY or REMOVE (S20) |
| "Intellectual Record · Latest from their record" (6 rows) and "View full record" | `ProfileRecordCard`, `/record` | REPLACE with the person's Posts and Articles list |
| Background rail: university, field, graduation, alumni, interests, research background | `ProfileBackground` | SIMPLIFY (I9) |
| Research profile (ORCID, methods) | `ProfileBackground research` prop, not loaded publicly | REMOVE (R1) |
| Points, tiers, badges | not on profile page; on `/leaderboard` and `/stats` | REMOVE (R11) |
| Collaboration | not on profile page; co-authored posts merged into record | REMOVE (R15, I4) |
| Opportunity readiness | owner dashboard, settings sections | REMOVE (R3) |
| Activity feed | `components/profile/RecentActivity.tsx` (dashboard only) | REMOVE from dashboard |
| Saved content | `/bookmarks`, not on profile | KEEP as private page |
| Owner analytics (profile funnel, views) | `ProfileViewTracker`, `lib/profileFunnel.ts`, `profileOwnerAnalytics` | SIMPLIFY (S15) |

### 14.2 Path to a writer profile

`lib/profileViewData.ts` already declares `PROFILE_VIEWS = ["overview", "articles", "posts", "about"]` and `contentKindFilter(kind)`, and `loadProfilePublications` queries `posts` rather than `profile_record_entries`. The page uses only `overview`. The simplest route:

1. Reconcile with `feature/profile-rebuild` (I8), which builds `ProfileTabs`, `ProfilePostsView` and `ProfileArticlesView` on these same views. Adopt it without `IntellectualFootprint` and record language, or take its tab shell only.
2. Header: avatar, name, username, bio, follower and following counts, Follow, Share, overflow (Report, Block). Drop Message, availability and record metrics.
3. Body: Posts and Articles tabs from `loadProfilePublications`. Drop Featured Work or reduce it to pins (S20).
4. Delete `/[username]/record` and the record data modules once nothing links to them.
5. `/settings/profile`: keep Identity and Topics sections; delete Research, Opportunities, Outcomes, Focus; reduce Background to optional fields decided in I9.

---

## 15. Recommended Deletion Order

Each step is one reviewable change that leaves the application building and tests passing. Database migrations trail the code by at least one deploy, so a rollback never meets a missing table.

**Before any step:** decide I7 (which branch Phase 2 lands on) and I8 (profile branch). Measure I5 and I13 against production.

| Step | Change | Why here |
|---|---|---|
| 0 | **Navigation to five destinations** (S14, S19 copy only). Remove nav links to Responses, Campus, Opportunities, Messages, Research, Record; add Notifications; point Profile at `/[username]`. No route deleted. | Instantly changes what the product feels like, is fully reversible, and removes the most visible entry points before their routes go. |
| 1 | **Research, review, citation** (R1, R2, R13). Delete research routes, submit, review, admin research and review, `/publication` (with redirect), editorial standards, research branches in post page, cards, skeleton, feed, search, edit route `EditForm`, review-reminders cron. | Already gated off. Highest downstream simplification. Resolve legacy policy briefs in flight (I5) first. |
| 2 | **Dead composer code and composer extras** (R24, R22, R15 in composer, R4 prompt path, R9 parent path). | Shrinks `write/actions.ts` by about half before anyone edits it again. |
| 3 | **Opportunities, talent, sponsors, partners, policy hub, ambassadors, alumni, campus** (R3 to R8). | Self-contained routes, unflagged but not in the core loop. Remove sitemap and Footer entries with them (I14). |
| 4 | **Messaging** (R14). Routes, APIs, badge, profile button, collaboration panel CTA, `messagingRepository` and parity entries. | Touches nav (done in step 0), profile header and `lib/db`. |
| 5 | **Responses** (R9). `/responses`, Discussion responses half, promote path, Respond links, response ranking signals, response notifications. | Needs step 2 (composer parent path) done. Decide display of existing responses (I5). |
| 6 | **Home clutter and retention** (R17, R18, R19, S2). Banners, sidebar, lead, interludes, extra tabs, daily brief cron, activation card, layout activity RPC. | Needs I15 decided to know which tabs survive. |
| 7 | **Profile to writer profile** (R10, R12 profile parts, S8, S9, S20, S21). | After step 3 and 4 remove opportunity and message affordances from the header; after I8. |
| 8 | **Subscriptions** (R20, R21). First replace `FollowButton` with a plain follow (I3), then delete subscription UI, delivery cron, managers, topic subscribe buttons, AI suggestions. | Flag-off today, but follow is wrapped in it, so it goes after the profile and post pages stop using `AuthorRelationshipControls`. |
| 9 | **Gamification, credibility, audio, lite mode** (R11, R12, R16, R23). Leaderboard, stats points, badges UI, credibility panels, quality chips, audio player and endpoint. | Mostly UI; the database side is step 11. |
| 10 | **Notifications, settings, onboarding, dashboard, explore, search, analytics** (S4 to S7, S10 to S13, S15). | Last UI pass, once the types and destinations they reference are gone. |
| 11 | **Database cleanup**, one migration per system, Debate-removal pattern: drop point and badge triggers on kept tables first (I2), then removed-feature functions, then tables, then columns, then notification rows and pref keys (I6), then buckets. Regenerate `scripts/audit/*.json`. | Only after the code that reads each object has been deployed without it. |
| 12 | **Content model finalisation** (I1). Make `type` derived or nullable, drop `article_format` and lock guards, remove `RESEARCH_TYPE_QUERY_EXCLUSION`. | Riskiest schema change; do it when nothing else is moving. |

---

## 16. Build Health

Commands run from the repository root on Windows (Git Bash), Node via `npm`.

### 16.1 Baseline (before any Phase 1 change)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | **Pass** (exit 0, 74s). Covers only `tsconfig.check.json` files. |
| Lint | `npm run lint` | **Pass** (exit 0, no warnings printed, 120s) |
| Tests | `npm test` | **2 failed**, 2,676 passed, 282 skipped (262 files, 266s) |
| Build | not run at baseline | see 16.2 |

### 16.2 After Phase 1 cleanup

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | **Pass** (exit 0) |
| Lint | `npm run lint` | **Pass** (exit 0) |
| Build | `npm run build` | **Pass** (exit 0, 2m42s). Compiled, full-project TypeScript pass succeeded, 80 static pages generated. |
| Tests | `npm test` | **1 failed** (the deterministic pre-existing failure below), 2,677 passed, 282 skipped (262 files, 221s). The load-sensitive failure did not recur. |

Build notes, not failures:

- `[sitemap] posts failed { message: 'Gateway Timeout' }` and `[sitemap] published authors failed ... SupabaseTimeoutError ... 8000ms` during static generation. The build machine reached Supabase slowly; `sitemap.ts` degraded and the build continued. Environmental, unrelated to the cleanup.
- `⚠ Using edge runtime on a page currently disables static generation for that page` (the OG image route). Pre-existing.
- `Browserslist: caniuse-lite is 6 months old`. Pre-existing.

### 16.3 Pre-existing failures

| Test | Failure | Classification |
|---|---|---|
| `supabase/migrations/parameterizeIdentityRpcsMigration.test.ts` › write paths › "check that the row they meant to change existed" | `expected '' to match /IF NOT FOUND THEN[\s\S]*?RAISE EXCEPTION/` at line 246: the slice of the migration it searches for the topics function is empty | **Deterministic**, reproduced in isolation. The test and `20260909000001_parameterize_identity_rpcs.sql` disagree, most likely after `a577774` reworked the identity RPCs. Not touched: it is migration contract work outside Phase 1. |
| `app/(main)/settings/profile/ProfileCommandCenter.test.tsx` › featured work editing › "keeps a note with its piece when the order changes" | `Test timed out in 5000ms` | **Load-sensitive.** Failed while lint and typecheck ran in parallel; passes when run alone. |

### 16.4 Phase 1 changes to the working tree

File deletions only, plus this document. Nothing staged or committed.

Deleted, each verified to have no production importer, no test importer, no dynamic import, no reference from `tsconfig*.json`, `eslint.config.mjs`, `vitest.config.ts`, `next.config.mjs` or `scripts/migration/*`, and no exported symbol used elsewhere:

| File | Lines | Last touched |
|---|---|---|
| `app/(main)/ExploreDropdown.tsx` | 103 | 2026-05-17 |
| `app/(main)/ForYouEmptyState.tsx` | 36 | 2026-08-18 |
| `app/(main)/MobileTrendingStrip.tsx` | 54 | 2026-04-18 |
| `components/post/FeaturedPostBanner.tsx` | 78 | 2026-07-07 |
| `components/post/QualityChecklist.tsx` | 108 | 2026-05-14 |
| `components/profile/DemonstratedExpertise.tsx` | 140 | 2026-08-27 |
| `components/profile/ProfileRecognition.tsx` | 136 | 2026-08-26 |
| `components/ui/DailyBriefGate.tsx` | 33 | 2026-04-18 |
| `components/ui/DailyBriefStrip.tsx` | 40 | 2026-09-05 |
| `components/ui/ErrorBoundary.tsx` | 49 | 2026-07-07 |
| `components/ui/LiteModeToggle.tsx` | 45 | 2026-04-23 |
| `components/ui/Pill.tsx` | 40 | 2026-04-18 |
| `components/ui/ProfileCompletionCard.tsx` | 88 | 2026-09-05 |
| `components/ui/SkeletonCard.tsx` | 49 | 2026-09-05 |
| `components/ui/SuggestedPeople.tsx` | 72 | 2026-08-01 |
| `components/ui/YourDraftCard.tsx` | 32 | 2026-04-18 |
| `lib/personaIcons.tsx` | 41 | 2026-07-10 |
| `lib/supabaseErrors.ts` | 15 | 2026-07-10 |
| `lib/utils-date.ts` | 5 | 2026-04-22 |

Considered and deliberately **not** deleted, although they have no production importer:

| File | Reason kept |
|---|---|
| `app/(main)/settings/ProfileForm.tsx` | Read as text by `lib/onboardingIdentityAlignment.test.ts` |
| `lib/credibilityGraphData.ts` | Listed in `scripts/migration/read-registry.mjs` (whose comment calling it reachable is now stale). Remove in R12 with the registry entry. |
| `components/ui/ActivationBanner.tsx`, `app/(main)/ContinueDraftRow.tsx`, `lib/shortPostHtml.ts`, `lib/profilePrivilegeGuard.ts` | Each has a test. Remove with its test in the owning Phase 2 step. |
| `lib/auth/viewer.ts`, `lib/db/parity.ts`, `lib/db/parityDiff.ts`, `lib/testUtils/supabaseMock.ts` | Migration and test infrastructure, not product code |
| `write/actions.ts` `ensureDraft`, `publishPost`, `savePostReferences` | Dead in production but covered by ~800 lines of tests; R24 |

Left alone: the uncommitted `indegenuis.zip` modification and `team-feed-redesign-1.zip` deletion that were in the working tree before this audit.

### 16.5 Environment variables that become obsolete

`ANTHROPIC_API_KEY`, `GOOGLE_TTS_API_KEY` (R16) · `GEMINI_API_KEY`, `GEMINI_TOPIC_MODEL`, `NEXT_PUBLIC_AI_TOPIC_SUGGESTIONS_ENABLED` (R21) · `NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED`, `NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_UX_V2_ENABLED`, `NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED` (R20) · `NEXT_PUBLIC_CREDIBILITY_GRAPH_ENABLED` (R12) · `NEXT_PUBLIC_FEATURED_WORK_NOTES_ENABLED`, `NEXT_PUBLIC_PROFILE_POSITIONING_ENABLED` (S20, S21) · `DAILY_BRIEF_DRY_RUN` (R18) · `NEXT_PUBLIC_ENABLE_REALTIME` (I11) · `FEED_EXPOSURE_SIGNING_SECRET` (I15). `GEMINI_RECAP_MODEL` is documented in `CLAUDE.md` but not read by any code.

---

## Method

- **Import graph.** A script resolved every `import`, `export ... from`, dynamic `import()` and `vi.mock()` specifier (`@/` and relative) across `app/`, `components/`, `lib/`, `scripts/` and `proxy.ts`, and recorded production and test importers per file. Counts in §8 come from it.
- **Reachability.** Each unwanted route's `page.tsx` and nearest `layout.tsx` were checked for flag reads, `notFound()` and redirects. Nav, sitemap and Footer links were read directly.
- **Database.** Tables, views, triggers and column additions were extracted from `supabase/schema*.sql` and `supabase/migrations/*.sql`. Function and policy inventories come from `scripts/audit/{fn,rls}-audit.json` (generated 2026-09-07, before Debate removal). Applied state of `supabase/pending/` comes from `docs/pending-migration-decisions.md`. None of this was confirmed against the live catalogue (I13).
- **Not done.** No production data counts (I5), no runtime click-through of the app, no inspection of the `feature/profile-rebuild` worktree beyond its git diff (its directory is owned by another Windows user and git refuses it as unsafe).
