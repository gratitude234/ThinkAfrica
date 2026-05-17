# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run lint     # Run ESLint
npm start        # Start production server
```

No test framework is configured in this project.

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (safe for client)
- `SUPABASE_SERVICE_ROLE_KEY` — Server-only admin key (never expose to client)
- `ADMIN_EMAIL` — Grants admin role to this email address

Optional:
- `NEXT_PUBLIC_APP_URL` — Defaults to `http://localhost:3000`
- `ADMIN_SECRET` — Protects internal API routes
- `RESEND_API_KEY` — Email service
- `ANTHROPIC_API_KEY` — Claude API for audio summaries (`/api/audio-summary`)
- `GOOGLE_TTS_API_KEY` — Text-to-speech

## Architecture Overview

**Stack**: Next.js App Router (v16), React 19, TypeScript, Tailwind CSS, Supabase (Postgres + Auth + Storage), Tiptap editor.

### Route Groups

```
app/
├── (auth)/          # Login, signup, forgot/reset-password — standalone AuthShell layout
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

Supabase clients are split by context — always use the right one:
- `lib/supabase/browser.ts` — client components
- `lib/supabase/server.ts` — server components and route handlers
- `lib/supabase/admin.ts` — server-only operations requiring elevated privileges

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
| `lib/types.ts` | Shared TypeScript interfaces — `PostStatus`, `PostType`, `AppRole`, `ReviewRecommendation`, `EditorDecision` |
| `lib/featureFlags.ts` | Feature gates — `debates: true`, `fellowshipsSection/ambassadors/talentMarketplace: false` |
| `lib/sanitizePostHtml.ts` | HTML sanitization before DB writes |
| `lib/activation.ts` / `lib/activationServer.ts` | Onboarding/activation tracking |
| `lib/roles.ts` | Permission helpers |
| `lib/debatePhases.ts` | Debate state machine |
| `lib/opportunityMatch.ts` | Fellowship recommendation matching |
| `lib/citationId.ts` | Citation ID generation for publications |

### Component Organization

```
components/
├── editor/          # Editor.tsx — Tiptap wrapper (StarterKit, Image, CharacterCount, Placeholder)
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
- Custom brand colors in `tailwind.config.ts`: `brand-emerald` (#10B981), `brand-gold` (#F59E0B), `brand-purple` (#7C3AED). Use these instead of raw Tailwind color classes.
- Fonts: Inter (body) and Playfair Display (headlines) — applied in the root layout.
- Nav visibility for feature-flagged sections (debates, fellowships, ambassadors, talent) is controlled exclusively via `lib/featureFlags.ts`.

### Database

Key tables: `profiles`, `posts`, `post_versions`, `post_authors` (co-authors), `post_references`, `post_likes`, `post_comments`, `post_reviews`, `post_editor_decisions`, `debates`, `debate_rounds`, `debate_arguments`, `follows`, `messages`, `notifications`, `badges`, `user_badges`, `opportunities`, `opportunity_applications`, `ambassador_applications`, `editor_assignments`.

Schema: `supabase/schema.sql` (base) + `supabase/schema_phase2-5.sql` (incremental). Timestamped migrations in `supabase/migrations/`. Apply via Supabase dashboard or CLI — no local migration runner configured.
