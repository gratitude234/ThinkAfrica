# Indegenius

Indegenius is a focused publishing product for reading Posts and Articles, publishing your own work, following writers, and discovering topics.

## Tech stack

- **Frontend:** Next.js 16, React 19, TypeScript, and Tailwind CSS
- **Backend:** Supabase (PostgreSQL, Auth, Storage, RLS, and RPCs)
- **Editor:** Tiptap rich-text editor
- **Testing:** Vitest, jsdom, and Testing Library

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and configure the required services.
3. Apply the ordered migrations in `supabase/migrations/` through the team-approved workflow.
4. Start the application with `npm run dev`.

The core application requires:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Do not use historical schema snapshots as setup instructions and do not apply files from `supabase/pending/` without release verification.

## Product model

- **Post:** short-form writing with an optional title.
- **Article:** titled long-form writing with optional sources and references.

Both publish directly. Drafts are private to their owner and are managed from the owner profile.

## Main routes

| Feature | Route |
|---|---|
| Home | `/` |
| Explore | `/explore` |
| Search | search overlay and `/search` |
| Write | `/write` |
| Notifications | `/notifications` |
| Profile | `/[username]` |
| Bookmarks | `/bookmarks` |
| Settings | `/settings` |
| Publication | `/post/[slug]` |
| Admin | `/admin` (admins only) |

`/dashboard` and `/me` permanently redirect a signed-in writer to their profile.

## Admin and safety

Admins can access users, moderation, reports, communications, basic platform counts, and security audit history. Block, report, suspension, and account-security infrastructure remain part of the product.

## Database cleanup boundary

Legacy tables, columns, notification rows, and analytics data remain in place until Phase 2J dependency verification. This UI pass does not drop or rewrite database structures.