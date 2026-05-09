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
├── (auth)/          # Login, signup — standalone layout
├── (main)/          # Full app shell with navigation
│   ├── page.tsx     # Home feed
│   ├── write/       # Post creation
│   ├── post/[slug]/ # Post detail + comments/reviews
│   ├── [username]/  # User profile
│   ├── admin/       # Review queue, analytics, fellowships
│   ├── debates/     # Debate platform
│   ├── messages/    # Direct messaging
│   └── ...          # ~30 more routes
└── (marketing)/     # Landing page, public info pages
```

API routes live in `app/api/`: `feed`, `audio-summary`, `debate-recap`, `upload-image`, `og`, `activation`.

### Data Layer

Supabase clients are split by context — always use the right one:
- `lib/supabase/browser.ts` — client components
- `lib/supabase/server.ts` — server components and route handlers
- `lib/supabase/admin.ts` — server-only operations requiring elevated privileges

The feed is driven by `lib/feedData.ts` (`fetchFeedPage()`) with tab/timeframe/type filtering and custom ranking logic in `lib/feedRanking.ts`.

### Authentication & Authorization

Auth is handled via Supabase SSR (`@supabase/ssr`). The auth proxy in `proxy.ts` intercepts requests, refreshes sessions via cookies, and redirects unauthenticated users away from protected routes (`/write`, `/admin/*`, `/dashboard`, `/settings`, etc.).

Role system (`lib/roles.ts`):
- Roles: `student` | `reviewer` | `editor` | `admin`
- `canReview()` → reviewer, editor, admin
- `canPublish()` → editor, admin
- Admin is granted when the user's email matches `ADMIN_EMAIL`

### Post Workflow

Posts move through statuses: `draft → pending → pending_revision → published | rejected`. The editorial review state machine lives in `lib/reviewWorkflow.ts`. Post type minimum word counts: blog (50), essay (500), policy_brief (400), research (1500). Quality scoring is in `lib/postQuality.ts`.

### Key Utilities

| File | Purpose |
|------|---------|
| `lib/types.ts` | Shared TypeScript interfaces |
| `lib/featureFlags.ts` | Feature gates |
| `lib/sanitizePostHtml.ts` | HTML sanitization before DB writes |
| `lib/activation.ts` | Onboarding/activation tracking |
| `lib/roles.ts` | Permission helpers |

### UI Conventions

- Server Components fetch data directly with the server Supabase client; mark interactive leaves with `"use client"`.
- Loading states use `loading.tsx` skeleton files (Suspense boundaries).
- Custom brand colors are defined in `tailwind.config.ts`: `brand-emerald` (#10B981), `brand-gold` (#F59E0B), `brand-purple` (#7C3AED). Use these instead of raw Tailwind color classes for on-brand UI.
- Fonts: Inter (body) and Playfair Display (headlines) — applied in the root layout.

### Database Migrations

Schema lives in `supabase/schema.sql` (base) and incremental `supabase/schema_phase2-5.sql`. Timestamped migration files are in `supabase/migrations/`. Run migrations against the Supabase dashboard or CLI — there is no local migration runner configured.
