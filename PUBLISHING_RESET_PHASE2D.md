# Publishing Reset: Phase 2D

Branch `refactor/publishing-reset`, uncommitted, on top of Phases 1, 2A, 2B and 2C.
Nothing was committed or pushed. The zip changes are untouched.

## READY FOR DEPLOYMENT — APPLY BEFORE APP DEPLOY

**`20260914000001_remove_review_reminders_cron_job.sql` is not applied.** It has
been rewritten against production's real scheduler, and a dry run against
production passed and rolled back. Apply it before the application deploys:

```
node scripts/migration/apply-cron-removal.mjs --dry-run
node scripts/migration/apply-cron-removal.mjs --apply
```

It was not applied here because nothing in the project's workflow authorizes a
production mutation from this environment. Until it is applied, production
keeps calling `/api/cron/review-reminders`, a route this branch no longer has,
once a day at 09:00 UTC.

## Executive Summary

Phase 2D removed nine application products: Opportunities, Fellowships, Talent,
Campus, Ambassadors, Alumni, Partners, the Policy Hub and sponsor placements.

- **90 files deleted, 12,967 lines.** That is 85 product files (12,276 lines)
  plus 5 modules the purge left without an importer (691 lines).
- **83 files modified, 2 added.** The additions are the guard test and the Cron
  apply script.
- **17 routes removed.** That is 11 public pages (the 8 product routes plus
  the fellowship detail and the ambassador apply and dashboard pages), 5 admin
  areas and 1 API route. Each public and admin address now redirects
  permanently.
- **Removed across the rest of the app:**
  - repository methods from both adapters: `dashboard.opportunityState`,
    `profilePage.opportunityState` and `search.opportunities`;
  - 23 analytics event names, 2 notification types and 1 notification category;
  - 1 email preference, 3 profile next actions and 2 Command Center sections;
  - 4 admin capabilities and the static feature flags.
- **Production row counts** show almost nothing was in use. Every opportunity,
  campus, ambassador, partner and sponsor table is empty. The exceptions are
  `talent_profiles` (7 rows), `policy_briefs_featured` (2) and `webinars` (2).
- **Messaging** is coupled to profiles, privacy, notifications, email, push,
  realtime and a database function. It was left in place, with a concrete plan
  below.
- **Checks:** typecheck, lint and build pass. Tests have 1 failure, the allowed
  baseline, so there are 0 new failures. The build produces 53 static pages,
  down from 69.

## Cron blocker resolution

**Production shape found.** A read-only inspection on 2026-09-15 found:

- the four scheduler functions (`dispatch_indegenius_cron`,
  `remove_indegenius_cron_jobs`, `inspect_indegenius_cron_jobs`,
  `install_indegenius_cron_jobs`) identical, character for character, to their
  definitions in `20260906000003_remove_debate_cron_jobs.sql`;
- six scheduled jobs: cron-history-prune, cron-http-reconcile, daily-brief,
  publication-recovery, resend-segment-sync and review-reminders;
- no `indegenius-db-telemetry` job and no `private.capture_db_telemetry()`.

`20260908000001_database_telemetry.sql` was never applied there. The
earlier draft of the removal migration started from the telemetry migration's
definitions, so applying it would have installed telemetry on production.

**Migration strategy.**

- **Regenerated in place.** It was never applied or committed, and a superseded
  draft would sit in the migration order as a file nobody may run.
- **Step 0 is a guard.** It raises if the database has the telemetry job or
  function, before anything changes.
- **Step 1 unschedules the job by id** while the remove set still knows it.
- **Steps 2 to 5 redefine the four functions** as `20260906000003` has them,
  minus the four review-reminder lines, and nothing else.
- **`reviewRemindersCronRemovalMigration.test.ts` checks the file on every run.**
  It derives the expected definitions from `20260906000003`, so the migration
  cannot drift. It also:
  - asserts that nothing after the guard mentions telemetry;
  - asserts that install schedules exactly the five remaining jobs;
  - asserts that the guard runs before any change;
  - asserts that the file touches no table, row or other function.

  10 tests pass. The related Cron contract tests still pass: 73 tests.
- **`scripts/migration/apply-cron-removal.mjs`** runs the file in one
  transaction with a 5-second lock timeout, then verifies inside that
  transaction:
  - the job is gone;
  - the other jobs are unchanged (name, schedule, command, active);
  - `inspect_indegenius_cron_jobs()` agrees;
  - dispatch refuses the review-reminder job and path;
  - no telemetry job exists.

  `--dry-run` always rolls back. `--apply` commits only if every check passed.

**Safe now?** Yes, for production as it is. The dry run against production
unscheduled jobid 10, left five jobs exactly as they were, passed every check
and rolled back. A read-only re-check confirmed production unchanged.

**Applied?** No. Status: READY FOR DEPLOYMENT — APPLY BEFORE APP DEPLOY.

**Consequence for telemetry.** `20260908000001` is now stale: it redefines the
scheduler from definitions that still carry the review-reminder job. It must be
rebased onto `20260914000001` before it is applied anywhere. `CLAUDE.md` says so.

## Opportunities

**Removed:**

- **Routes:** `/opportunities` (page and loading).
- **Components:** `components/opportunities/` in full:
  - `OpportunityProfileEditor`, `OpportunityReadinessCard`,
    `SaveOpportunityButton`;
  - `opportunityActions.ts` and its test.
- **Library modules:** `lib/opportunities.ts`, `opportunityMatch.ts`,
  `opportunityReadiness.ts`, `applicationReview.ts`, and
  `opportunityOutcomes.test.ts`.
- **Outcomes:** `settings/profile/outcomeActions.ts` and
  `sections/OutcomesSection.tsx`.
- **Credibility graph** (it existed to surface outcomes and recognition):
  - `lib/credibilityGraph.ts` (+test), `credibilityGraphData.ts`,
    `profileCredibility.ts`;
  - `lib/demonstratedExpertise.ts` (+test), orphaned once the graph went.
- **Surfaces:**
  - the dashboard readiness card, opportunity pipeline, inquiries list and
    applications table;
  - the Explore opportunities rail and mobile banner;
  - the search results section;
  - the "Open to opportunities" badge on profiles;
  - the Opportunities and Outcomes sections of the Command Center;
  - the `complete_opportunities`, `confirm_outcome` and `publish_outcome` next
    actions.

`isCredibilityGraphEnabled()` stays. It still gates citation edges in the
composer, and its comment now says what it no longer gates.

## Fellowships

**Removed:**

- **Routes:** `/fellowships`, `/fellowships/[id]`, and their apply form and
  action.
- **Admin:** `/admin/fellowships` (form, application actions, page).
- **Data reads** of `fellowships`, `fellowship_applications` and
  `saved_opportunities`:
  - the dashboard repository;
  - `lib/discoverData.ts`, which fetched open fellowships and counts on every
    Explore render;
  - the search repository;
  - admin analytics;
  - the weekly digest.
- **Other:**
  - the `fellowship` notification descriptor;
  - the `fellowship_*` analytics events;
  - the `fellowshipsSection` flag;
  - the `fellowships` variant of `EmptyState`;
  - the open-fellowships section of the weekly digest email and its preview.

## Talent

**Removed:**

- **Routes:** `/talent`.
- **Module:** `lib/talentDiscovery.ts`.
- **Inquiry flow:**
  - `components/profile/ContactInquiryModal.tsx` (+test);
  - both `opportunityInquiryActions.ts` files (profile and dashboard);
  - the `opportunity_inquiry` notification and its email preference
    (`email_opportunity_inquiry`);
  - the `profile_inquiry_*` funnel steps.
- **Profile data:** the `talent_profiles` reads on the public profile, Command
  Center and Explore, and the Command Center's `saveOpportunitiesSection`
  write.
- **Flag:** `talentMarketplace`.

The profile conversion funnel now has three steps: view, work opened, follow
completed. `docs/profile-conversion-funnel.md` still describes five.

## Campus

**Removed:**

- **Routes:** `/campus`.
- **Admin:** `/admin/campuses` (operations forms, cohort status, targets,
  actions).
- **Module:** `lib/campus.ts` (+test).
- **Surfaces:** the Explore "More on Indegenius" rail card (its only entry was
  Campus), the `/campus` sitemap entry and the `campus_hub_viewed` event.
- **Digest:**
  - the campus-prompt sections of the digest email and preview;
  - the recipient query's `campus_cohort_memberships` embed.

The database trigger `profiles_assign_selected_campus_cohort` still runs on
every profile insert and update. With 0 cohorts it assigns nothing. It is first
in the deletion list below rather than dropped here, because it is inert.

## Ambassadors

**Removed:**

- **Routes:** `/ambassadors`, `/ambassadors/apply` (form, action) and
  `/ambassadors/dashboard` (activity form, action).
- **Admin:** `/admin/ambassadors`.
- **Other:**
  - the Footer's flag-gated "Become an Ambassador" link;
  - the About page's "Become a campus ambassador" call to action;
  - the `ambassadors` flag;
  - the `ambassador_*` events;
  - the admin hub's "Ambassador requests" stat card.

## Alumni

**Removed:**

- **Routes:** `/alumni`.
- **Leaderboard:** the Alumni tab and its three `is_alumni` queries.
  `/leaderboard?tab=alumni` renders the weekly ranking.
- **Profile:** the "Alumni" recognition badge.
- **Mentoring:** the "Open to mentoring" toggle and the `open_to_mentoring`
  write, in:
  - the Command Center Background section;
  - its server action;
  - the legacy `settings/profileActions.ts` and `ProfileForm.tsx`.
- **Copy:** "alumni directory" in the visibility and privacy settings, now
  "member directory".

Kept, as legacy content compatibility:

- `is_alumni` is still read with the public identity;
- the "graduate" headline and the "Graduated" or "Expected graduation" label
  still use it.

Production has 0 alumni, so neither shows today.

## Partners

`/partners` was a contact form posting to `/api/partner-contact`, which wrote
`contact_requests` behind an in-process rate limiter. It held no static contact
details.

**Removed:**

- **Routes:** the page, `PartnerContactForm`, the API route (+test), and
  `/admin/partners` (form, toggle, actions).
- **Modules:** `lib/contactRequests.ts` (+test), and `lib/rateLimit.ts` (+test),
  whose only caller was that route.

What a visitor still needs moved to About as one line: a "Partnerships" block
with a mailto link to the approved `partnership` sender identity from
`lib/emailSenders.ts`, which resolves the domain per environment. `/partners`
redirects to `/about`. The `partnership` sender stays, because broadcasts use it.

## Policy Hub

**Removed:**

- **Routes:** `/policy` (page, `FeaturePolicyButton`, featuring action).
- **Featuring:** the "Policy Briefs: feature for institutions" section of
  `/admin/review` and its `policy_briefs_featured` read. The page and the admin
  nav card now say "Choose what is featured on the home feed."
- **Links:** the Footer's "Policy Hub" link.

Historic policy-brief Articles are untouched. Production has 1 published and 3
drafts with `article_format = 'policy_brief'`. The published one still returns
200 at its own URL, with its body, and links to no retired destination.

Kept as content-model compatibility, for the content-model phase to decide:

- the "Article · Policy Brief" card and Open Graph labels;
- the Explore genre refinement (All genres, General, Essay, Policy Brief);
- the legacy `type=policy_brief` Explore parameter;
- the "briefs" label in admin analytics' posts-by-type.

The Explore chip filters Articles by their own `article_format`, the same axis
as Essay. It is not Policy Hub discovery. Removing it alone would leave a
format that still labels cards but cannot be filtered.

## Sponsor system

**Application layer removed:**

- `components/ui/SponsorBanner.tsx`;
- `/admin/sponsors` (form, toggle, actions, page);
- the `sponsors.manage` capability;
- the leaderboard's `sponsor_placements` query, which ran on every leaderboard
  render.

No sponsor query executes anywhere now. `sponsor_placements` has 0 rows and
stays in the database.

## Admin

**Removed management systems:**

- `/admin/fellowships`, `/admin/campuses`, `/admin/ambassadors`,
  `/admin/partners`, `/admin/sponsors`;
- the capabilities `opportunities.manage`, `partners.manage`,
  `sponsors.manage` and `ambassadors.manage`;
- the Policy Hub featuring controls;
- the admin hub's "Applications" and "Ambassador requests" stat cards and the
  two queries behind them.

**Admin analytics** lost these sections and cards:

- the sections "Opportunity Outcomes", "Partner Discovery" and
  "Application Review";
- the cards "Inquiry Triage", "Opportunity Items", "Opportunity Clicks",
  "Opportunity-ready Profiles" and "Opportunity Applications";
- the five queries behind them: `fellowship_applications` ×2,
  `saved_opportunities`, `talent_profiles` and `talent_inquiries`.

**Digest:** it lost its fellowship and campus sections. The digest itself
belongs to the Home and retention phase.

**Communications:** the broadcast editor's link placeholder is now
`indegenius.africa/explore`.

**Kept:** moderation, verification, communications, featured posts, analytics
and the digest.

**Redirects:** the five retired admin paths go to `/admin`.

## Search & Explore

**Search:**

- `searchRepository.opportunities` is gone from both adapters, with its SQL,
  result type, limit constant, neon test and live parity test.
- `/api/search` returns `{ posts, people }`.
- The search page lost its Opportunities group and tab, and its intro now reads
  "Find posts, writers, and topics from one place."

**Explore:**

- The Opportunities rail card, the Campus destinations card and the mobile
  opportunities banner are gone.
- `getDiscoverData` no longer fetches open fellowships or the opportunity
  summary counts. That was three queries behind two caches, one of them
  `talent_profiles`.
- The aside now holds only the writers card.

**Home** had no residual queries for these products.

## Profiles

Public profile:

- `loadProfileOpportunityState` and `profilePageRepository.opportunityState`
  are gone, from both adapters, the neon test and the live parity test. The
  profile page runs one query fewer.
- `ProfileHeader` lost the availability badge, the inquiry modal and three
  props (`isOpenToOpportunities`, `canContact`, `talentProfileId`).
- `ProfileIdentityPanel` lost its `availability` slot, which had no other user.
- The Alumni badge is gone.

Command Center (`/settings/profile`):

- The Opportunities and Outcomes sections are gone.
- The model lost `opportunities` and `background.openToMentoring`.
- The preview no longer carries `isOpenToOpportunities`.
- The talent query is gone from `loadProfileCommandCenter`.

Retained deliberately:

- **Reserved usernames.** `RESERVED_PROFILE_PATHS` and the `GuestBanner` route
  list still reserve opportunities, fellowships, talent, campus, ambassadors,
  alumni, partners and policy, so a member cannot claim a segment an old link
  points at. The guard test asserts this.
- **Column lists.** `profilePrivilegeGuard` and `profileMutations` still name
  `open_to_mentoring` and `is_alumni`. They guard columns that still exist, so
  they are database-deferred.

## Dashboard

**Removed:**

- `OpportunityReadinessCard` and the opportunity pipeline panel;
- the "Opportunity ready" portfolio item and the readiness fallback in the
  next-action card;
- the "Opportunity interest" inquiries section with its read and archive forms;
- the "Opportunity applications" table;
- the `opportunity_readiness_viewed` tracker;
- `dashboardRepository.opportunityState` and its six SQL statements and five
  row types, from both adapters and the neon test.

The page went from 856 to 391 lines and runs six fewer PostgREST calls per load.
The portfolio card's copy no longer mentions opportunity-ready work or selectors.

## Notifications & emails

**Retired active flows:**

- the `fellowship` and `opportunity_inquiry` descriptors;
- the `opportunities` notification category, with its inbox group, filter chip
  and count;
- the `email_opportunity_inquiry` preference, from the settings row, defaults
  and both preference-key unions;
- the talent inquiry email, sent only by the deleted inquiry actions;
- the partner contact submission;
- the fellowship and campus-prompt sections of the digest email.

Generic transactional and auth email are untouched.

**Historic compatibility.** Production has 0 notification rows of any retired
type, so nothing links to a deleted destination and no compatibility path was
needed. A stray future row would render with the catalog's generic fallback.
Historic email records are untouched.

## Production data measurements

Read-only transactions, aggregate counts only, 2026-09-15.

| Family | Table | Rows |
|---|---|---|
| Opportunities | `fellowships` | 0 |
| | `fellowship_applications` | 0 |
| | `saved_opportunities` | 0 |
| | `opportunity_outcomes` | 0 |
| | `opportunity_outcome_events` | 0 |
| | `opportunities`, `opportunity_applications` | absent |
| Talent | `talent_profiles` | 7 (4 open to opportunities and public) |
| | `talent_inquiries` | 0 |
| Campus | `campus_programs` | 0 |
| | `campus_cohorts` | 0 |
| | `campus_cohort_memberships` | 0 |
| | `campus_editorial_prompts` | 0 |
| | `campus_prompt_submissions` | 0 |
| Ambassadors | `campus_ambassadors` | 0 |
| | `campus_ambassador_activity` | 0 |
| | `ambassador_applications` | absent |
| Partners, sponsors | `institutional_partners` | 0 |
| | `sponsor_placements` | 0 |
| | `contact_requests` | 0 |
| | `webinars` | 2 |
| | `webinar_attendees` | 1 |
| | `webinar_questions` | 0 |
| Policy Hub | `policy_briefs_featured` | 2 (1 pointing at a published post) |
| | posts with `article_format = 'policy_brief'` | 1 published, 3 drafts |
| | posts with `type = 'policy_brief'` | 4 |
| Alumni | profiles with `is_alumni` | 0 |
| | profiles with `open_to_mentoring` | 24 |
| | profiles with `graduation_year` set | 66 (kept: onboarding uses it) |
| Messaging | `conversations` | 20 |
| | `conversation_participants` | 39 |
| | `messages` | 52 |

**Other measurements:**

- **Notification rows of retired types:** 0.
- **Notification types present:**

  | Type | Rows |
  |---|---|
  | follow | 1169 |
  | like | 948 |
  | author_published | 257 |
  | post_approved | 195 |
  | comment | 121 |
  | response_post | 17 |
  | review_assigned | 10 |
  | author_subscribed | 5 |
  | post_published | 3 |
  | review_reminder | 2 |
  | revision_requested | 1 |
  | review_started | 1 |

- **`notification_prefs` key `email_opportunity_inquiry`:** carried by 3
  profiles. It stays, because the brief says not to drop JSONB keys yet.
- **Historic activation events for the retired names** (all kept):

  | Event | Rows |
  |---|---|
  | `opportunity_readiness_viewed` | 675 |
  | `opportunity_profile_viewed` | 492 |
  | `opportunity_profile_updated` | 20 |
  | `opportunity_profile_setup_cta_clicked` | 20 |
  | `opportunity_inquiry_started` | 8 |
  | `opportunity_filter_used` | 6 |
  | `profile_inquiry_opened` | 1 |

**Finding.** `public.find_or_create_conversation` still treats "target has a
public `talent_profiles` row open to opportunities" as a reason a stranger may
start a conversation. That rule currently covers 4 members. Nothing in the app
can set it any more. It was not changed here, because it changes who can
message whom and messaging is its own phase. See the plan below.

## Repository / parity cleanup

- **Methods removed from both adapters:**
  - `DashboardRepository.opportunityState`, with its five SQL statements and
    `DashboardProofPost`, `DashboardApplicationRow`,
    `DashboardOpportunityRow`, `DashboardInquiryRow` and
    `DashboardTalentProfile`;
  - `ProfilePageRepository.opportunityState`, with `OPPORTUNITY_SQL` and
    `ProfileOpportunityRow`;
  - `SearchRepository.opportunities`, with `OPPORTUNITIES_SQL` and
    `SearchOpportunityResult`.
- **Tests removed with them:**
  - the three matching neon tests (`dashboard`, `profilePage`, `search`);
  - the two live parity cases ("agrees on the opportunity state", "agrees on
    the opportunity results");
  - the obsolete "applications read" describe in `columnContract.test.ts`.
- **Adapter comments** now state the current call counts.
- **Registries:**
  - `scripts/migration/read-registry.mjs` lost thirteen entries for deleted
    files and runs with 0 unclassified;
  - `tsconfig.check.json` lost ten entries for deleted files;
  - `scripts/migration/preview-check.mjs` no longer expects an
    "opportunity state failed" error.
- **Contract tests:**
  - `lib/serverActionContract.test.ts` lost its two inquiry-action exceptions,
    and its sanity floor went from 30 to 20 modules (29 remain);
  - `lib/browserWriteBoundary.test.ts` no longer lists the two deleted
    server-only modules.

No unrelated migration domain was touched.

## Messaging audit

**Not removed.** It is coupled well beyond its own routes.

| Area | Coupling |
|---|---|
| Routes | `/messages` (page, layout, loading, `ConversationListClient`), `/messages/[id]` (page, loading, `MessageThread`, `actions.ts`) |
| APIs | `/api/messages/[id]/poll` (called by `MessageThread`); `/api/messages/unread` (no caller found: orphan) |
| Profile | `ProfileHeader`'s `MessageButton` and signed-out "Message" button; `loadProfileViewerContext` computes `viewer.messaging` via `lib/messagingEligibility.ts`; `lib/conversationActions.ts` calls RPC `find_or_create_conversation` |
| Repository | `lib/db/messaging.ts` (`messagingRepository` in `readAdapter.ts`); `viewerStateRepository.isBlockedPair` is shared with blocking, which stays |
| Realtime | `MessageThread` subscribes to `postgres_changes` on `messages:${conversationId}`, with polling fallback |
| Notifications and email | `messages/[id]/actions.ts` sends email (`email_messages`) and push (`push_messages`); both keys live in `NotificationsForm`, settings defaults, `lib/email.ts`, `lib/publicationDelivery.ts` and `lib/push.ts` |
| Privacy | `allow_messages` in `privacy_settings`, edited by the Command Center `VisibilitySection` and `PrivacyForm` |
| Analytics | `message_started` and `message_sent` events; the admin analytics Messaging section and its `messages` count query |
| Shell | `navRoutes.ts` suppresses the rail and mobile nav on `/messages`; `robots.ts` disallows `/messages/`; `messages` is a reserved username |
| Tests | `messageMutations.test.ts`, `viewerState.neon.test.ts`, `ProfileHeader.test.tsx`, `profileViewData.test.ts`, `publicReadPath.test.ts`, `navRoutes.test.ts`, `AppShell.test.tsx`, `NotificationsForm.test.tsx`, `writeFreeze.test.ts`, `profileSecurityMigration.test.ts` |
| Database | `conversations` (20), `conversation_participants` (39), `messages` (52), their RLS policies, realtime publication membership, and `find_or_create_conversation` (mutual follow, same university, or public open talent profile) |
| Trust and safety | Suspension copy says a suspended member "cannot post, comment, or message". Block, report, suspension and moderation do not depend on messaging and stay. |

### PHASE 2E MESSAGING REMOVAL PLAN

1. **Measure, read-only.** Count conversations with activity in the last 30
   and 90 days, messages per conversation, and email and push sends from the
   message action. Aggregates only.
2. **Decide what a member keeps.** Recommendation: no export and no read-only
   inbox; say so in release notes. If an export is required, build it as a
   one-off script, not a product surface.
3. **Remove the entry points first.**
   - `ProfileHeader`: `MessageButton`, the signed-out "Message" button, and the
     `messagingEligibility` prop.
   - `loadProfileViewerContext`: drop `messaging`, and the `getMessageEligibility`
     call from the profile path. Keep `isBlockedPair`.
   - Update `ProfileHeader.test.tsx`, `profileViewData.test.ts` and
     `publicReadPath.test.ts`.
4. **Remove the product.**
   - Delete `app/(main)/messages/**`, `app/api/messages/**`,
     `lib/conversationActions.ts`, `lib/messagingEligibility.ts`,
     `lib/db/messaging.ts` and `messageMutations.test.ts`.
   - Remove `messagingRepository` from `readAdapter.ts`, and its registry and
     parity entries.
   - Redirect `/messages` and `/messages/:path*` to `/notifications`, or to `/`.
     Keep `messages` reserved.
5. **Remove the side channels.**
   - Remove `email_messages` and `push_messages` from the settings rows,
     defaults and the three key unions. Leave the JSONB keys.
   - Remove the `message_started` and `message_sent` event names, and the admin
     analytics Messaging section with its `messages` count.
   - Remove `allow_messages` from `VisibilitySection` and `PrivacyForm`. Keep
     the JSONB key.
   - Drop `/messages` from `navRoutes.ts` and `robots.ts`.
   - Reword the suspension copy.
6. **Add a guard.** Extend `lib/retiredProductFamilies.test.ts`, or add a
   sibling, for the routes, modules, tables (`conversations`,
   `conversation_participants`, `messages`), the RPC name and the event names.
7. **Database, a later step and not in 2E's app deploy.**
   - Revoke execute on `find_or_create_conversation`, then drop it. That also
     retires the `talent_profiles` eligibility rule above.
   - Remove the tables from the realtime publication.
   - Drop their policies and the tables themselves, after a snapshot.
8. **Checks:** typecheck, lint, test and build, plus route checks on
   `/messages`, a profile (no Message control) and `/settings/profile`.

**Recommended next phase: Phase 2E = Messaging deletion.**

## Routes

**Deleted:** `/opportunities`, `/fellowships`, `/fellowships/[id]`, `/talent`,
`/campus`, `/ambassadors`, `/ambassadors/apply`, `/ambassadors/dashboard`,
`/alumni`, `/partners`, `/policy`, `/admin/fellowships`, `/admin/campuses`,
`/admin/ambassadors`, `/admin/partners`, `/admin/sponsors`,
`/api/partner-contact`.

**Redirects added** in `next.config.mjs`, all permanent:

| Source | Destination |
|---|---|
| `/opportunities`, `/fellowships`, `/fellowships/:path*`, `/talent`, `/campus`, `/ambassadors`, `/ambassadors/:path*`, `/alumni`, `/policy` | `/explore` |
| `/partners` | `/about` |
| `/admin/fellowships`, `/admin/campuses`, `/admin/ambassadors`, `/admin/partners`, `/admin/sponsors` | `/admin` |

Old detail links (`/fellowships/<id>`) redirect rather than 404, because they
went out in digest emails and search results. No placeholder page exists for any
retired route.

**Also removed from navigation:**

- sitemap: `/campus` and `/opportunities`;
- Footer: Opportunities, Policy Hub and Become an Ambassador;
- landing nav: Opportunities;
- About: the ambassador call to action;
- the messages empty state, which now links to `/explore`, "Find writers on
  Explore".

`robots.ts` named none of them.

### Route checks

Fresh `npm run build`, `next start -p 3131`, signed out. The server was stopped
afterwards.

| Path | Status | Result |
|---|---|---|
| `/` | 307 | to `/landing` (signed-out Home); `/?guest=1` 200, no retired links or copy |
| `/landing`, `/explore`, `/search` | 200 | no retired links, opportunity copy, Policy Hub, ambassador, alumni or sponsor markers |
| `/about` | 200 | same, plus the Partnerships mailto block present |
| `/leaderboard`, `/leaderboard?tab=alumni` | 200 | no Alumni tab, no sponsor |
| `/write`, `/notifications`, `/dashboard`, `/settings/profile` | 307 | to `/login` |
| a Post | 200 | comments heading present, no retired links |
| an Article | 200 | comments heading present, no retired links |
| the historic policy-brief Article | 200 | not redirected, body present, no Policy Hub link |
| a public profile | 200 | no retired links, opportunity copy or Alumni badge |
| a profile that was open to opportunities | 200 | no "Open to opportunities" badge, no retired links |
| every public retired route, including `/fellowships/<id>`, `/ambassadors/apply` and `/ambassadors/dashboard` | 308 | to `/explore`, except `/partners` to `/about` |
| the five admin routes | 308 | to `/admin` |
| `POST /api/partner-contact` | 404 | |
| `/sitemap.xml` | 200 | no retired URL |

Production's review-reminder Cron job is still scheduled (count 1), as
expected before the migration is applied.

## Files

- **Deleted: 90 files, 12,967 lines.**
  - **Product removal: 85 files, 12,276 lines.** The admin areas (5
    directories), the 8 public product directories, `app/api/partner-contact`,
    `components/opportunities`, `SponsorBanner`, `ContactInquiryModal` (+test),
    both `opportunityInquiryActions`, the Explore mobile banner (+test), the
    Opportunities and Outcomes sections, `outcomeActions`, and the library
    modules listed per family above.
  - **Orphans the purge left behind: 5 files, 691 lines.**
    `components/ui/Tag.tsx`, `lib/demonstratedExpertise.ts` (+test),
    `lib/rateLimit.ts` (+test).
- **Added: 2.**
  - `lib/retiredProductFamilies.test.ts` (59 tests);
  - `scripts/migration/apply-cron-removal.mjs`.
- **Modified: 83.** They include the regenerated migration
  `20260914000001_remove_review_reminders_cron_job.sql` and its rewritten
  contract test, `next.config.mjs`, `CLAUDE.md`, `tsconfig.check.json`, and the
  registry and preview-check scripts.

### Orphan search

Terms searched across `app/`, `components/`, `lib/`, `scripts/`, `supabase/`,
`docs/` and the root files: opportunity, fellowship, talent, campus, ambassador,
alumni, sponsor, partner, policy brief, Policy Hub, inquiry, mentoring.

| Occurrence | Class |
|---|---|
| `next.config.mjs` redirect sources | KEEP |
| `RESERVED_PROFILE_PATHS`, `GuestBanner` route list | KEEP (reserved segments) |
| `lib/emailSenders.ts` `partnership` identity, `lib/broadcasts.ts` | KEEP (communications, About contact) |
| `lib/profileTypes.ts` "mentoring students", privacy page "inquiries", About team biographies | KEEP (generic words, personal biographies) |
| `lib/devFixtures/homeFeedFixtures.ts` sample post text | KEEP (dev preview fixture) |
| Badge, PostCard, PostCover, `postQuality.ts`, OG route "Policy Brief" labels; Explore Policy Brief genre; admin analytics Editorial Trust "Policy Brief Submissions" and "briefs" | LEGACY CONTENT COMPATIBILITY |
| `is_alumni` in identity reads (`lib/db/types.ts`, both profile adapters, `parity.ts`, `profileIdentity.ts`, `ProfileBackground`, record page, Command Center preview) | LEGACY CONTENT COMPATIBILITY |
| `profilePrivilegeGuard.ts`, `profileMutations.ts` column names | DATABASE DEFERRED |
| Comments describing the removal (dashboard repository, leaderboard, admin review, Explore, About, feature flags, `globals.css`, composer page) | HISTORICAL |
| `supabase/migrations/**`, `supabase/pending/**`, `supabase/schema*.sql`, `scripts/migration/out/**`, `scripts/audit/db-audit.json`, `campusPhase3Migration.test.ts`, `debateRemovalMigration.test.ts` | HISTORICAL DOC/MIGRATION |
| `docs/database-access-inventory.md`, `content-model*.md`, `credibility-graph.md`, `profile-rebuild*.md`, `publishing-core-v2-audit.md`, `phase-0-product-truth.md`, `profile-conversion-funnel.md` | HISTORICAL DOC (a docs pass should update them) |
| `Tag.tsx`, `demonstratedExpertise.ts`, `rateLimit.ts` and tests; `EmptyState` fellowships variant; registry, typecheck, contract and preview-check entries; "Opportunity-ready" portfolio copy; the `profileOwnerAnalytics` comment | STALE, deleted or fixed |

## Tests

Sequential, on the final tree:

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | 1 failed (baseline `parameterizeIdentityRpcsMigration.test.ts`, same assertion), 2,496 passed, 267 skipped; files 1 failed, 224 passed, 17 skipped |
| `npm run build` | pass, 53 static pages (was 69) |
| New failures | **0** |

Full-project `tsc` (outside the typecheck subset): 49 errors, the same set as
before Phase 2D, none new.

The 63 fewer passing and 6 fewer skipped tests than Phase 2C are deleted
product tests:

- Partner contact route, ContactInquiryModal, opportunity actions, campus,
  contact requests, credibility graph, opportunity outcomes, demonstrated
  expertise, rate limit and the mobile opportunities banner;
- the removed cases in the Command Center, next-action, preview, notification
  and inbox tests;
- the neon and live parity cases.

The new guard adds 59.

**`lib/retiredProductFamilies.test.ts`** reads no migration file and strips
comments before matching. It asserts:

- the 15 retired directories and 20 retired modules do not exist, and nothing
  imports them;
- no string or template literal in `app/`, `components/` or `lib/` links to a
  retired route;
- no `.from("…")` or `public.…` reads or writes the 18 retired tables;
- no retired profile section, next action, notification descriptor or category,
  analytics event, admin capability or feature switch exists;
- every retired public route redirects permanently to its destination, detail
  paths included, and the admin paths go to `/admin`;
- no placeholder page answers a retired address;
- every retired segment stays a reserved username.

## Deferred database cleanup

Nothing below was executed. Catalogue facts from a read-only production
inspection on 2026-09-15.

**Tables** (21, RLS on, 49 policies between them):

- Opportunities: `fellowships`, `fellowship_applications`,
  `saved_opportunities`, `opportunity_outcomes`,
  `opportunity_outcome_events`.
- Talent: `talent_profiles`, `talent_inquiries`.
- Campus and Ambassadors: `campus_programs`, `campus_cohorts`,
  `campus_cohort_memberships`, `campus_editorial_prompts`,
  `campus_prompt_submissions`, `campus_ambassadors`,
  `campus_ambassador_activity`.
- Partners, sponsors and the Policy Hub: `institutional_partners`,
  `sponsor_placements`, `contact_requests`, `policy_briefs_featured`.
- Webinars, retired earlier: `webinars`, `webinar_attendees`,
  `webinar_questions`.

No surviving table has a foreign key into any of them. Their own 22 foreign keys
point outward, at `profiles`, `posts` and `auth.users`, so they drop without
touching a surviving constraint.

**Columns:**

- `profiles.is_alumni` (0 true);
- `profiles.open_to_mentoring` (24 true).

Both are still named by `profile_directory`, the identity reads,
`profilePrivilegeGuard` and `profileMutations`. The JSONB key
`notification_prefs.email_opportunity_inquiry` (3 profiles) and its entry in
`private.set_notification_preference_impl`'s allowlist also go. `graduation_year`
is not a candidate, because onboarding uses it.

**Views:**

- `public.public_opportunity_outcomes`: drop.
- `public.profile_directory`: redefine without `is_alumni` and
  `open_to_mentoring` before those columns go. No application code reads it.

**Functions:**

- Campus: `assign_profile_to_selected_campus_cohort()`,
  `backfill_selected_campus_cohort_memberships()`, `get_campus_candidates()`,
  `get_campus_cohort_metrics()`.
- Alumni: `promote_alumni()`, which is not scheduled.
- Outcomes: `can_verify_opportunity_outcome`, `submit_opportunity_outcome`,
  `verify_opportunity_outcome`, `dispute_opportunity_outcome`,
  `revoke_opportunity_outcome`, `set_opportunity_outcome_visibility`.
- Update-timestamp triggers: `touch_fellowships_updated_at()`,
  `touch_talent_inquiries_updated_at()`.
- Webinars: `toggle_question_upvote(uuid)`.
- **Redefine, don't drop:** `find_or_create_conversation`, to lose its
  `talent_profiles` rule, or drop it with messaging in 2E.
- Not a candidate: `record_broadcast_delivery_outcome`, which matched on the
  word "outcome" only.

**Triggers:**

- `profiles_assign_selected_campus_cohort` on `profiles`, which fires on insert
  and update. Drop it first. It is inert with 0 cohorts.
- The update-timestamp triggers on `fellowships`, `talent_inquiries` and
  `campus_cohorts` go with their tables.

**RLS policies:** the 49 on the tables above. No policy on a surviving table
names them.

**Cron jobs:** none of these products is scheduled. `indegenius-review-reminders`
leaves with `20260914000001`.

**Storage buckets:** none belongs to these products. The five buckets are
`audio-summaries`, `avatars`, `post-images`, `research-documents` and
`research-project-assets`; the last two are Research, which is a different phase.

**Suggested order:**

1. Drop the `profiles_assign_selected_campus_cohort` trigger.
2. Redefine `find_or_create_conversation`, or drop it with messaging.
3. Redefine `profile_directory`.
4. Drop `public_opportunity_outcomes`.
5. Revoke and then drop the functions.
6. Snapshot the tables that hold rows (`talent_profiles`,
   `policy_briefs_featured`, `webinars`, `webinar_attendees`), then drop the 21
   tables.
7. Drop the two columns, the JSONB key and the allowlist entry.
8. Update the column lists in `profilePrivilegeGuard.ts`, `profileMutations.ts`
   and `lib/db/parity.ts`, the identity reads, the schema dump and the Neon
   manifest.

## Deferred

- **Applying the Cron migration**, then rebasing `20260908000001` before
  telemetry goes anywhere.
- **Messaging:** Phase 2E, plan above.
- **Brand copy:** `lib/brand.ts` and the About team biographies still say
  "respond" and "research". That belongs to the brand pass.
- **Documentation** that still describes the retired products (listed under
  Orphan search).
- **Pre-existing orphans unrelated to these products:** `ContinueDraftRow`,
  `ActivationBanner`, `lib/auth/viewer.ts`, `lib/shortPostHtml.ts`, the legacy
  `settings/ProfileForm.tsx` (read as text by two tests), and an unused
  `createClient` import in `ProfileHeader.tsx`. None was created by this phase.
- **Content model:** `article_format`, the Policy Brief genre and legacy
  `type` values.
- **Gamification:** the leaderboard, points and badges.

## Next step: Phase 2E

**Messaging deletion**, per the plan above. After that: Home/feed and retention
simplification.
