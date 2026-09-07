# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # Run ESLint
npm start            # Start production server
npm run typecheck    # Type-check selected files (tsconfig.check.json)
npm test             # Run Vitest test suite once
npm run test:watch   # Run Vitest in watch mode
```

Tests use Vitest with jsdom. Test files live alongside source files (`*.test.ts`, `*.test.tsx`). The `typecheck` script only covers the files listed in `tsconfig.check.json`, not the entire codebase.

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key (safe for client)
- `SUPABASE_SERVICE_ROLE_KEY`: Server-only admin key (never expose to client)
- `ADMIN_EMAIL`: Grants admin role to this email address

Optional:
- `NEXT_PUBLIC_APP_URL`: Defaults to `http://localhost:3000`
- `ADMIN_SECRET`: Protects internal API routes
- `RESEND_API_KEY`: Email service
- `ANTHROPIC_API_KEY`: Claude API for audio summaries (`/api/audio-summary`)
- `GEMINI_RECAP_MODEL`: Optional Gemini recap model override; defaults to `gemini-3.6-flash`
- `GEMINI_TOPIC_MODEL`: Optional Gemini topic-classification model override; defaults to `gemini-3.6-flash`
- `NEXT_PUBLIC_AI_TOPIC_SUGGESTIONS_ENABLED`: Set to `1` only after the AI topic pending migration is applied and verified
- `NEXT_PUBLIC_CREDIBILITY_GRAPH_ENABLED`: Set to `1` only after `20260827000001`, `20260827000002` and `20260827000003` are applied and verified. Gates citation edges, the public Demonstrated expertise and Recognition sections, and verified opportunity outcomes
- `NEXT_PUBLIC_FEATURED_WORK_NOTES_ENABLED`: Set to `1` only after `20260826000002_featured_work_notes.sql` is applied and verified. Until then Featured Work notes are neither read nor written, and `replace_my_featured_posts` v1 is used
- `NEXT_PUBLIC_PROFILE_POSITIONING_ENABLED`: Set to `1` only after `20260826000001_profile_positioning_statement.sql` is applied and verified. Until then the public profile, the full record and settings leave the `positioning_statement` column out of their projections, because PostgREST rejects a select naming a column that does not exist
- `EMAIL_SENDER_DOMAIN` / `EMAIL_PLATFORM_SENDER_DOMAIN`: Domains the five sender identities in `lib/emailSenders.ts` send from. Both default to `NEXT_PUBLIC_APP_DOMAIN`. The identities themselves are not configurable; `EMAIL_FROM` is no longer read
- `RESEND_WEBHOOK_SECRET`: Signing secret for `/api/webhooks/resend`. Without it the route answers 503 and broadcasts record no delivery. Subscribe the endpoint to `email.delivered`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed` and `contact.updated`
- `SUPABASE_SERVER_TIMEOUT_MS`: Deadline in milliseconds on every PostgREST and Auth call made through `lib/supabase/server.ts`. Defaults to `8000`; `0` disables it. Storage is always exempt. See `lib/supabase/fetchTimeout.ts`
- `POST_QUERY_DEBUG`: Set to `1` to log one `[post/<slug>] core post query executed` line per core post lookup. Off by default; used to confirm in production that `generateMetadata` and the page share one query
- `DATABASE_ADAPTER`: Which implementation `lib/db` answers from. Unset (the default) and `supabase` both mean Supabase PostgREST, which is what production runs. `postgres` selects the direct-SQL adapter, which needs `DATABASE_URL`. Any other value throws, so a typo during a cutover is not mistaken for a decision to stay on Supabase. See `docs/neon-migration-plan.md`
- `DATABASE_URL`: Pooled PostgreSQL connection string, read only when `DATABASE_ADAPTER=postgres`. Preview and scratch only for now; production does not set it. In a Cloudflare Worker this is **not** read: the connection string comes from the Hyperdrive binding through `setConnectionString()`
- `DATABASE_URL_DIRECT`: Unpooled admin connection for migrations and DDL, under a different role. Deliberately never read at runtime
- `GOOGLE_TTS_API_KEY`: Text-to-speech
- `CRON_SECRET`: Authenticates Vercel Cron requests to `/api/cron/*` routes (Vercel sends it automatically as `Authorization: Bearer <value>` when set)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_MAILTO`: Web push (VAPID keypair + contact address for `lib/push.ts`)

## Architecture Overview

**Stack**: Next.js App Router (v16), React 19, TypeScript, Tailwind CSS, Supabase (Postgres + Auth + Storage), Tiptap editor.

### Route Groups

```
app/
├── (auth)/          # Login, signup, forgot/reset-password (standalone AuthShell layout)
├── (write)/         # Composer, no app chrome
│   └── write/       # UniversalComposer: the one canvas for posts and articles
├── draft/[token]/   # Public read-only view of a shared draft (no route group, no auth)
├── (main)/          # Full app shell with NavigationShell
│   ├── page.tsx     # Home feed (tabs: home/following/latest)
│   ├── submit/research/  # Research-specific submission form
│   ├── post/[slug]/ # Post detail, comments, reviews
│   ├── edit/[slug]/ # Edit published posts
│   ├── publication/[citationId]/  # Published post with citation
│   ├── [username]/  # User profile with followers/following
│   ├── dashboard/   # User dashboard
│   ├── settings/    # User settings
│   ├── admin/       # Review queue, analytics, fellowships, partners, sponsors, ambassadors, digest, verification
│   ├── messages/[id]/  # Direct messaging
│   ├── discover/    # Explore interface
│   ├── search/      # Full-text search
│   ├── topics/[tag]/   # Tag-based filtering
│   ├── bookmarks/   # Saved posts
│   ├── leaderboard/ # Points/contribution ranking
│   ├── opportunities/  # Fellowships/scholarships
│   ├── onboarding/  # New user flow
│   └── notifications/  # Activity notifications
└── (marketing)/     # Landing page, public info pages
```

API routes (`app/api/`):

| Route | Purpose |
|-------|---------|
| `GET /api/feed` | Paginated feed with ranking |
| `GET /api/search` | Site search. `scope=overlay` is the command-palette typeahead |
| `GET /api/topics` | Every topic in use, with counts, for tag suggestions and the trending list |
| `POST /api/upload-image` | Image upload to Supabase Storage |
| `POST /api/research-document/upload` | PDF/document upload |
| `GET /api/research-document/[postId]` | Retrieve research document |
| `POST /api/audio-summary` | Claude API audio synthesis |
| `GET /api/cron/resend-segment-sync` | Nightly recipient sync and broadcast reconciliation |
| `POST /api/webhooks/resend` | Broadcast delivery counts and unsubscribe mirroring |
| `POST /api/activation` | Track activation/onboarding events |
| `GET /api/og` | Open Graph image generation |

### Data Layer

Supabase clients are split by context. Always use the right one:
- `lib/supabase/client.ts`: client components
- `lib/supabase/server.ts`: server components and route handlers
- `lib/supabase/admin.ts`: server-only operations requiring elevated privileges

The feed is driven by `lib/feedData.ts` (`fetchFeedPage()`) with tab/timeframe/type filtering and custom ranking logic in `lib/feedRanking.ts`. Quality signals come from `lib/postQuality.ts`.

`lib/db` is the provider boundary for the migration off PostgREST. It holds the
row shapes and repository contracts (`lib/db/types.ts`), the Supabase
implementation that production runs (`lib/db/supabase/`), and the direct-SQL
implementation that will run against Neon (`lib/db/postgres/`).
`getDatabase()` picks between them from `DATABASE_ADAPTER`, process-wide rather
than per request, so a page is never composed of rows from two databases.

Two domains are behind it so far, **reads only**:

- The core post lookup, which `lib/postBySlug.ts` asks for instead of querying
  itself.
- The public profile identity lookup, which `loadProfileIdentity()` in
  `lib/profileViewData.ts` asks for. Everything else on the profile page still
  takes a `SupabaseClient` directly.

Every **write** goes to Supabase unconditionally, with no adapter branch
anywhere in its path, and that is the boundary rather than an unfinished
migration. Profile writes go through `lib/profileMutations.ts`. See
`docs/profiles-domain-migration.md` for the read/write split and
`docs/adr-neon-authorization.md` for why.

Everything else still calls Supabase directly, and the audit of what that means
is in `docs/database-access-inventory.md`.

`postgres.js` is installed and `lib/db/postgres/connection.ts` opens a real
pool. Its options (`max: 5`, `prepare: false`, an 8-second
`statement_timeout`) are not preferences and are pinned by a test; the reasons
are in `docs/neon-migration-plan.md` §2.

Two rules for anything moved next:

- A repository is `server-only` and takes the acting user id as a required
  argument when it mutates. RLS is what refuses an unauthorized write today,
  and a direct connection does not have it.
- The Supabase and Postgres implementations of a method must be behaviourally
  identical, not merely similar. `lib/db/postgres/posts.ts` documents the four
  places where a faithful port is not the obvious one, and
  `lib/db/postgres/profiles.ts` three more.
- Anything the driver does not hand back in the shape TypeScript claims goes
  through `lib/db/postgres/normalise.ts`, which exists because
  `fetch_types: false` means postgres.js knows no type OIDs. Both Phase 3
  production failures were array columns, in opposite directions, and neither
  was caught by a type.

Four layers keep the two implementations honest: per-adapter unit tests, the
normaliser regression tests, `lib/db/parity.ts` field-by-field against two live
databases (`node scripts/migration/parity-check.mjs`), and
`scripts/migration/preview-check.mjs`, which renders real pages through both
adapters on one build and compares the visible text. Only the last catches the
failure mode that matters most: a TypeError inside a Suspense boundary, on a
page that still answers HTTP 200.

### Authentication & Authorization

`proxy.ts` (the middleware) creates a Supabase SSR client, refreshes auth cookies, and redirects unauthenticated users away from protected routes: `/write`, `/admin/*`, `/onboarding`, `/stats`, `/dashboard`, `/settings`, `/bookmarks`, `/notifications`, `/edit/*`.

Role system (`lib/roles.ts`):
- Roles: `student` | `reviewer` | `editor` | `admin`
- `canReview()` → reviewer, editor, admin
- `canPublish()` → editor, admin
- Admin is granted when the user's email matches `ADMIN_EMAIL`
- Admin route guards live in `lib/adminAccess.ts` (`requireAdminHubAccess()`)

### Post Workflow

Posts move through statuses: `draft → pending → pending_revision → published | rejected`. The editorial review state machine lives in `lib/reviewWorkflow.ts`. Tables involved: `post_reviews` (round-based reviewer feedback), `post_editor_decisions` (editor approve/reject).

Post type minimum word counts: blog (50), essay (500), policy_brief (400), research (1500).

### Key Utilities

| File | Purpose |
|------|---------|
| `lib/types.ts` | Shared TypeScript interfaces: `PostStatus`, `PostType`, `AppRole`, `ReviewRecommendation`, `EditorDecision` |
| `lib/featureFlags.ts` | Feature gates: `research/fellowshipsSection/ambassadors/talentMarketplace: false` |
| `lib/sanitizePostHtml.ts` | HTML sanitization before DB writes |
| `lib/activation.ts` / `lib/activationServer.ts` | Onboarding/activation tracking |
| `lib/roles.ts` | Permission helpers |
| `lib/opportunityMatch.ts` | Fellowship recommendation matching |
| `lib/citationId.ts` | Citation ID generation for publications |
| `lib/searchData.ts` | Every search query, server-side. Escapes the PostgREST `or=` filters that used to take raw user text |
| `lib/postBySlug.ts` | The one core post lookup for `/post/[slug]`, memoised per render with React `cache()` |
| `lib/serverAuth.ts` | `getCurrentUser()`, the session validation memoised per render |
| `lib/supabase/fetchTimeout.ts` | Fail-fast deadline on PostgREST and Auth calls |
| `lib/db/` | The provider boundary: repository contracts, the Supabase implementation, and the direct-SQL one |

### Component Organization

```
components/
├── editor/          # Editor.tsx: Tiptap wrapper (StarterKit, Image, CharacterCount, Placeholder)
├── post/            # PostCard, PostFeed, PostCover
├── profile/         # ProfileHeader, ProfileCard, CredentialsCard
├── admin/           # Admin-specific UI
├── collaboration/   # Co-author invite UI
├── editorial/       # EditorialTrustPanel
├── notifications/   # Notification UI
├── opportunities/   # Fellowship cards, application UI
├── retention/       # Activation checklist, retention banners
└── ui/              # Button, Badge, Toast, SearchOverlay, Footer, etc.
```

The `Editor.tsx` component exposes an `EditorHandle` ref for toolbar
integration (`toggleBold`, `toggleItalic`, `toggleH2`, `toggleH3`,
`toggleBulletList`, `toggleOrderedList`, `toggleBlockquote`, `insertDivider`,
`isActive`, `undo`/`redo` with `canUndo`/`canRedo`, `triggerImageUpload`,
`insertLink`, `insertCitation`, `getSelectedImage`/`updateSelectedImage`), and
fires `onUpdate` / `onSelectionUpdate` callbacks.

Images use a `CaptionedImage` extension over Tiptap's `Image`: with a caption
it serializes to `<figure><img><figcaption>`, without one to a bare `<img>`, so
images published before captions existed keep round-tripping unchanged. Files
can be pasted or dropped into the body (`handlePaste` / `handleDrop`), except
when the clipboard also carries `text/html`, which means the writer is pasting
from a word processor and wants the markup. `sanitizePostHtml` already allows
`figure`, `figcaption`, `pre`, `hr`, and tables, so the pipeline supports more
than the toolbar currently exposes.

### UI Conventions

- Server Components fetch data directly with the server Supabase client; mark interactive leaves with `"use client"`.
- Loading states use `loading.tsx` skeleton files (Suspense boundaries).
- Custom brand colors in `tailwind.config.ts` are deep and low-chroma, not the bright Tailwind defaults: `emerald-brand` (#073929), `gold` (#CE932B), `gold-ink` (#8A5D1E), `purple-accent` (#391A60), with `green-tint`/`gold-tint`/`purple-tint` and `green-wash`/`green-wash-border` as their surfaces. Neutrals are `canvas` (#FAF8F5), `surface`, `ink`, `ink-muted`. Use these rather than raw Tailwind color classes, and read the config rather than this list when exact values matter.
- Fonts: Inter (body, `font-sans`) and Bodoni Moda (headlines, `font-display`), both loaded in the root layout via `next/font/google`.
- Nav visibility for feature-flagged sections (fellowships, ambassadors, talent) is controlled exclusively via `lib/featureFlags.ts`.

### Product Voice

User-facing copy must not contain em dashes. They are the strongest tell that a
string was machine-written, and the habit shows up as one repeated shape: a short
statement, an em dash, then a reassuring elaboration ("Your work isn't lost - try
again"). Swapping the character alone keeps that shape, so rewrite the sentence:

- **Default**: split into two sentences. "Your work isn't lost. Try again."
- **Colon** when the second half labels or defines the first. "Public: anyone can view your profile"
- **Comma** for a genuine aside. "FOR wins, 60% to 40%"
- **`·`** as a separator inside badges, eyebrows and `<option>` labels. "FOR · confirmed"
- **Cut it** when the trailing clause is filler. A quip reads more machine-written than the dash does.

ESLint enforces this across `app/`, `components/` and `lib/` (`no-restricted-syntax`
in `eslint.config.mjs`). It inspects string and JSX text nodes only, so comments and
docs are unaffected. A genuine typographic em dash (an empty-cell marker, a quote
attribution) is still correct and takes an `eslint-disable-next-line` at the site.
Prefer this voice in comments and docs too: the register here is what gets copied
into the next string someone writes.

### Database

Key tables: `profiles`, `posts`, `post_versions`, `post_authors` (co-authors), `post_references`, `post_likes`, `post_comments`, `post_reviews`, `post_editor_decisions`, `post_edit_drafts`, `post_draft_shares`, `post_revisions`, `follows`, `messages`, `notifications`, `badges`, `user_badges`, `opportunities`, `opportunity_applications`, `ambassador_applications`, `editor_assignments`.

Two draft-only tables back the composer and are separate from the editorial
workflow. `post_draft_shares` holds one unlisted read token per draft, revoked
by stamping `revoked_at` rather than deleting. `post_revisions` holds periodic
snapshots written only by the `record_post_revision()` function, which throttles
to one snapshot per three minutes and prunes to the most recent 40. Neither ever
touches a published or reviewed post: `post_versions` still owns those.

Email broadcasts (`/admin/communications`) add `broadcasts`, `broadcast_segments`,
`broadcast_contacts`, `broadcast_delivery_events`, `broadcast_sync_runs` and
`broadcast_sync_state`. All six have RLS on with no policies and are readable
only by `service_role`: `broadcast_contacts` holds one row per member with their
address on it. Three rules the code depends on:

- A broadcast is claimed for sending by `claim_broadcast_for_send()`, one
  statement, and `dispatch_started_at` makes the row unclaimable once
  `broadcasts.send` has been called. Exactly one thing clears that stamp, and
  it is never a guess: Resend answering that the broadcast is still `draft` on
  its side, which proves no send was accepted. `releaseAfterRejection()` does
  it at send time after a definitive validation rejection, and
  `reconcileStuckBroadcasts()` does it later for anything stranded. A `queued`
  or `sent` broadcast, and a broadcast Resend cannot account for, stay locked.
  Both go through `release_broadcast_after_provider_draft()`, one statement,
  for the same reason the claim is one statement: a guard over a nullable
  column assembled from separate PostgREST filters can match nothing and report
  no error. `reconcileStuckBroadcasts()` returns an outcome for every row it
  examined, including the ones it declined, and the cron route returns them.
- Resend has no operation that replaces a contact's segment memberships.
  `POST /contacts` is an upsert that answers 201 for an existing contact and
  whose `segments` field only ever adds, so an empty list removes nothing.
  `syncContactSegments()` therefore reads `GET /contacts/{id}/segments` and
  issues explicit `POST`/`DELETE .../segments/{segmentId}` calls, and removals
  are computed only against the segment ids the caller says it manages.
- `broadcast_contacts.segment_keys` is what Resend is known to have, not what
  we want it to have. It is stamped with `synced_at` after a push succeeds,
  never in the earlier derived-state upsert: the push queue is the difference
  between those two, so writing the desired set early erases the evidence and a
  failed push then looks permanently synced.
- Delivery counters move only through `record_broadcast_delivery_outcome()`,
  which writes to `broadcast_delivery_events` first and increments only when
  that write was new. Resend retries webhooks, so replay is the normal case.
  There are three mutually exclusive buckets, `delivered_count`,
  `suppressed_count` and `failed_count`, and at most one event per `email_id`
  ever counts. Suppression is never a failure: Resend declined to attempt the
  address, nothing bounced. Pending is derived, never stored.
- A campaign is finished when Resend's broadcast says `sent`, not when the
  buckets add up. `mark_broadcast_provider_sent()` is the only transition to
  `sent`, called by `reconcileStuckBroadcasts()` and by the detail page on
  view. Recipient outcomes keep arriving and keep counting afterwards.
- Two different rows carrying the same campaign are one campaign.
  `claim_broadcast_for_campaign()` takes an advisory lock on the fingerprint
  from `lib/broadcastFingerprint.ts` (normalised subject, body text and
  audience identity, deliberately *not* the sender), checks for an equivalent
  irreversible broadcast inside a 24-hour window, and only then runs the
  per-row claim. Doing the check from the application before calling a claim
  that does not know about it is what let two of them out two minutes apart.
  The override skips only the duplicate question.
- After a send, equivalent editable drafts become `superseded`: kept, readable,
  linked to what replaced them, and not sendable. Nothing is deleted.
- `broadcast_contacts.suppressed_at` is deliverability and is kept strictly
  apart from `email_announcements`, which is consent. A suppression never
  touches `notification_prefs`. It is keyed to `suppressed_email`, so a member
  who changes address is deliverable again with no manual step; otherwise
  clearing is explicit via `clear_broadcast_suppression()`, because
  `resend@6.12.3` exposes no suppression-list API to consult.
- `email_announcements` is the opt-out category, separate from `email_digest`.
  Resend owns the unsubscribe link, so an opt-out arrives from Resend and is
  mirrored inward; only the member turning the switch back on in settings
  reverses it, via the `profiles_broadcast_resubscribe` trigger.
- Member addresses are read with `list_broadcast_contact_emails()`, never with
  `auth.admin.listUsers()`. GoTrue models the auth token columns as
  non-nullable strings, so a single row holding NULL in one of them (any row
  inserted by direct SQL rather than through the Auth API) fails the whole
  request with `Database error finding users`. Reading `id` and `email` in SQL
  never constructs that struct. There is deliberately no fallback to
  `profiles.signup_email`: it is populated for almost nobody, so a fallback
  would sync a near-empty audience and report success.
- Reserved test domains (`example.com`/`.org`/`.net`, and anything under the
  `.invalid`, `.test`, `.example` and `.localhost` TLDs) are ineligible in
  `lib/broadcastEligibility.ts`, alongside the opt-outs. Resend rejects a whole
  broadcast when one is in the addressed segment, so the exclusion has to be in
  the shared definition rather than in one caller's filter. A cached contact
  already in a segment leaves it on the next sync, which pushes it with no
  segments.

Database telemetry (`20260908000001_database_telemetry.sql`) adds four private
tables (`db_health_snapshots`, `db_connection_snapshots`, `db_activity_snapshots`,
`db_query_snapshots`), two delta views and `private.db_incident_report()`. RLS on,
no policies, `private` schema, so only a BYPASSRLS role reads them. The capture
job runs every five minutes under an 8-second statement timeout and prunes to
seven days inside the same run. It never resets `pg_stat_statements`: the
accumulated counters are the evidence. See `docs/database-incident-diagnostics.md`.

Schema: `supabase/schema.sql` (base) + `supabase/schema_phase2-5.sql` (incremental). Timestamped migrations in `supabase/migrations/`. Apply via Supabase dashboard or CLI. There is no local migration runner configured, so `supabase/migrations/emailBroadcastsMigration.test.ts` asserts the contracts that would otherwise only fail in production.

Scheduling lives in Supabase Cron, not `vercel.json`. Adding a job means editing
all four private functions in `20260827110918_migrate_scheduler_to_supabase_cron.sql`
(dispatch allowlist, remove set, inspect set, install) and then running
`select private.install_indegenius_cron_jobs();`. See
`20260902000002_schedule_resend_segment_sync.sql` for the pattern.

### Infrastructure migration (in progress)

Indegenius is moving from Vercel + Supabase to Cloudflare Workers + Hyperdrive
+ Neon + Better Auth + R2. Resend stays. **Production is still entirely on
Vercel + Supabase**; Phase 1 is an audit plus one database-abstraction proof of
concept, and nothing about auth, storage, DNS or hosting has changed.

Four documents carry the plan, and they are the answer to "can I just query
that table here":

| Doc | Covers |
|---|---|
| `docs/database-access-inventory.md` | Every database call site, classified. Browser-side access, tables, RPCs, what is obsolete |
| `docs/auth-and-rls-migration.md` | `auth.users`, the 146 RLS policies, and where authorization has to move to |
| `docs/neon-migration-plan.md` | Driver choice, `lib/db`, the Neon runbook, Hyperdrive, environment variables |
| `docs/post-page-query-path.md` §8 | The article's 17 round trips, classified for the caching work |
| `docs/rpc-identity-migration.md` | The 22 `auth.uid()` RPCs, the six that are parameterised, and the rollout |
| `docs/pending-migration-decisions.md` | Which `supabase/pending/` candidates are actually live. Four of five are |
| `docs/neon-schema-transformation.md` | The Supabase to Neon pipeline, the manifest, and the two driver bugs it found |
| `docs/realtime-blocker.md` | What depends on Supabase Realtime, and the options for replacing it |

Four constraints that apply to new code written before the migration lands:

- **Never write to the database from a client component.** Phase 2 took this to
  zero: all twenty table writes and all five write-RPCs moved behind server
  actions and one route handler. `lib/browserWriteBoundary.test.ts` enforces
  it, so a new one is a failing test rather than a review comment. Fifteen
  client components still *read*, and those are classified in
  `docs/database-access-inventory.md` §3.
- **A mutation never takes a user, profile or owner id as an argument.** The
  server resolves the viewer with `requireViewer()` from `lib/serverActions.ts`.
  An argument is something a browser can choose, and RLS is what currently
  makes a forged one harmless. A direct PostgreSQL connection will not.
- **Do not add a database function that derives the actor from `auth.uid()`.**
  Take the user id as a parameter and raise on null. `auth.uid()` returns null
  off Supabase, so a guard written that way does not fail after the migration:
  it silently updates nothing and reports success. See
  `20260909000001_parameterize_identity_rpcs.sql` for the shape.
- **Do not rely on RLS as the only check on a write.** New writes authorize
  explicitly, in this order: authenticated, owns the resource, role permits it,
  business rules, and then check the affected row count. An
  `UPDATE ... WHERE id = $1 AND owner = $2` whose result nobody inspects is the
  same silent failure as `auth.uid()`.

Two things Phase 3 established that change how to read the rest of this file:

- **The catalogue is the source of truth, not `supabase/migrations/`.** Four of
  the five candidates in `supabase/pending/` are applied in production despite
  having no promoted migration file, and three objects exist that the
  repository has no `CREATE TABLE` for. Before reasoning about the schema, read
  it: `node scripts/migration/measure-supabase.mjs`.
- **`postgres.js` runs with `fetch_types: false`**, so it has no type OIDs.
  Arrays neither serialise as parameters nor parse as results. Pass scalars,
  and select an array column as `to_jsonb(...)`. Both failure modes reached a
  running application before anything caught them; see
  `docs/neon-schema-transformation.md` §5.
