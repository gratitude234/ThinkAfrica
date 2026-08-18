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
- `GEMINI_API_KEY`: Gemini API for debate recaps (`/api/debate-recap`)
- `GEMINI_RECAP_MODEL`: Optional Gemini recap model override; defaults to `gemini-3.6-flash`
- `GEMINI_TOPIC_MODEL`: Optional Gemini topic-classification model override; defaults to `gemini-3.6-flash`
- `NEXT_PUBLIC_AI_TOPIC_SUGGESTIONS_ENABLED`: Set to `1` only after the AI topic pending migration is applied and verified
- `GOOGLE_TTS_API_KEY`: Text-to-speech
- `CRON_SECRET`: Authenticates Vercel Cron requests to `/api/cron/*` routes (Vercel sends it automatically as `Authorization: Bearer <value>` when set)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_MAILTO`: Web push (VAPID keypair + contact address for `lib/push.ts`)
- `DEBATE_V2_ACTIVATION_ENABLED`: Set to `1` to expose the moderator-facing "convert to Debate V2" control and allow `activate_debate_v2` to run. Off by default until staging concurrency/grant verification and cron scheduling for round auto-advancement are confirmed (see `docs/debate-v2-phase2-lifecycle.md`).

## Architecture Overview

**Stack**: Next.js App Router (v16), React 19, TypeScript, Tailwind CSS, Supabase (Postgres + Auth + Storage), Tiptap editor.

### Route Groups

```
app/
├── (auth)/          # Login, signup, forgot/reset-password (standalone AuthShell layout)
├── (main)/          # Full app shell with NavigationShell
│   ├── page.tsx     # Home feed (tabs: home/following/latest)
│   ├── write/       # Post creation (blog, essay, research, policy_brief)
│   ├── submit/research/  # Research-specific submission form
│   ├── post/[slug]/ # Post detail, comments, reviews
│   ├── edit/[slug]/ # Edit published posts
│   ├── publication/[citationId]/  # Published post with citation
│   ├── [username]/  # User profile with followers/following
│   ├── dashboard/   # User dashboard
│   ├── settings/    # User settings
│   ├── admin/       # Review queue, analytics, fellowships, partners, sponsors, ambassadors, digest, verification
│   ├── debates/     # Debate platform (guarded by FEATURE_FLAGS.debates)
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
| `POST /api/upload-image` | Image upload to Supabase Storage |
| `POST /api/research-document/upload` | PDF/document upload |
| `GET /api/research-document/[postId]` | Retrieve research document |
| `POST /api/audio-summary` | Claude API audio synthesis |
| `POST /api/debate-recap` | Generate debate summary |
| `POST /api/activation` | Track activation/onboarding events |
| `GET /api/og` | Open Graph image generation |

### Data Layer

Supabase clients are split by context. Always use the right one:
- `lib/supabase/browser.ts`: client components
- `lib/supabase/server.ts`: server components and route handlers
- `lib/supabase/admin.ts`: server-only operations requiring elevated privileges

The feed is driven by `lib/feedData.ts` (`fetchFeedPage()`) with tab/timeframe/type filtering and custom ranking logic in `lib/feedRanking.ts`. Quality signals come from `lib/postQuality.ts`.

### Authentication & Authorization

`proxy.ts` (the middleware) creates a Supabase SSR client, refreshes auth cookies, and redirects unauthenticated users away from protected routes: `/write`, `/admin/*`, `/debates/create`, `/onboarding`, `/stats`, `/dashboard`, `/settings`, `/bookmarks`, `/notifications`, `/edit/*`.

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
| `lib/featureFlags.ts` | Feature gates: `debates: true`, `fellowshipsSection/ambassadors/talentMarketplace: false` |
| `lib/sanitizePostHtml.ts` | HTML sanitization before DB writes |
| `lib/activation.ts` / `lib/activationServer.ts` | Onboarding/activation tracking |
| `lib/roles.ts` | Permission helpers |
| `lib/debatePhases.ts` | Debate state machine |
| `lib/opportunityMatch.ts` | Fellowship recommendation matching |
| `lib/citationId.ts` | Citation ID generation for publications |

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

The `Editor.tsx` component exposes an `EditorHandle` ref (`toggleBold`, `toggleItalic`, `toggleH2`, `toggleBulletList`, `toggleBlockquote`, `isActive`) for toolbar integration, and fires `onUpdate` / `onAutoSave` callbacks.

### UI Conventions

- Server Components fetch data directly with the server Supabase client; mark interactive leaves with `"use client"`.
- Loading states use `loading.tsx` skeleton files (Suspense boundaries).
- Custom brand colors in `tailwind.config.ts` are deep and low-chroma, not the bright Tailwind defaults: `emerald-brand` (#073929), `gold` (#CE932B), `gold-ink` (#8A5D1E), `purple-accent` (#391A60), with `green-tint`/`gold-tint`/`purple-tint` and `green-wash`/`green-wash-border` as their surfaces. Neutrals are `canvas` (#FAF8F5), `surface`, `ink`, `ink-muted`. Use these rather than raw Tailwind color classes, and read the config rather than this list when exact values matter.
- Fonts: Inter (body, `font-sans`) and Bodoni Moda (headlines, `font-display`), both loaded in the root layout via `next/font/google`.
- Nav visibility for feature-flagged sections (debates, fellowships, ambassadors, talent) is controlled exclusively via `lib/featureFlags.ts`.

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

Key tables: `profiles`, `posts`, `post_versions`, `post_authors` (co-authors), `post_references`, `post_likes`, `post_comments`, `post_reviews`, `post_editor_decisions`, `debates`, `debate_rounds`, `debate_arguments`, `follows`, `messages`, `notifications`, `badges`, `user_badges`, `opportunities`, `opportunity_applications`, `ambassador_applications`, `editor_assignments`.

Schema: `supabase/schema.sql` (base) + `supabase/schema_phase2-5.sql` (incremental). Timestamped migrations in `supabase/migrations/`. Apply via Supabase dashboard or CLI. There is no local migration runner configured.
