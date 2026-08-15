# Indegenius

Indegenius is an intellectual social network, originating in African university communities, for publishing ideas, discussing them, and building a credible public record of contribution.

## Tech stack

- **Frontend:** Next.js 16, React 19, TypeScript, and Tailwind CSS
- **Backend:** Supabase (PostgreSQL, Auth, Storage, RLS, RPCs, and optional Realtime)
- **Editor:** Tiptap rich-text editor
- **Testing:** Vitest, jsdom, and Testing Library

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd indegenius
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local`, then provide the credentials required for the features you intend to use. Product flags use an exact string convention: `1` enables a flag; `0` or an unset value disables it.

At minimum, the core application expects:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Keep `DAILY_BRIEF_DRY_RUN=1` until the target environment, recipient query, push credentials, and scheduled job have been verified.

### 3. Prepare the database safely

The database is maintained through the ordered files in `supabase/migrations/`. The `supabase/schema*.sql` files are historical snapshots and are **not** sufficient setup instructions for the current application. Files in `supabase/pending/` are release candidates and are deliberately excluded from the executable migration ledger.

Before applying anything to staging or production:

1. Read [`docs/phase-0-product-truth.md`](docs/phase-0-product-truth.md).
2. Record the target database's migration ledger and relevant catalog objects.
3. Reconcile those results with `supabase/migrations/`.
4. Follow the repository's feature-specific release documents.

Do not paste `supabase/schema.sql` into a current project and do not run a blind database push. This repository audit did not verify either staging or production.

For a new isolated development database, use the team's approved Supabase migration workflow to apply the executable migrations in timestamp order. Do not promote or apply files from `supabase/pending/` as part of local setup.

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Canonical content model

| Kind | Authoring contract | Publication and trust |
|------|--------------------|-----------------------|
| **Post** | Lightweight body, optional title, up to 2,000 characters | Publishes directly; not formally reviewed or citable |
| **Article** | Title and long-form rich text; Essay and Policy Brief are optional genres | Publishes directly; genre is not evidence of review or credibility |
| **Research** | PDF, title, abstract, keywords, authors, and references | Enters formal editorial review; becomes reviewed and citable only after acceptance |

The database temporarily retains the legacy `posts.type` values `blog`, `essay`, `policy_brief`, and `research`. Application code must resolve content through `content_kind` and `article_format`, with the centralized compatibility helpers in `lib/contentModel.ts`. See [`docs/content-model.md`](docs/content-model.md) for the migration contract.

## Main routes

| Feature | Route |
|---------|-------|
| Home feed | `/` |
| Explore | `/explore` |
| Sign up | `/signup` |
| Log in | `/login` |
| Create a Post | `/create/post` |
| Write an Article | `/write?kind=article` |
| Submit Research | `/submit/research` |
| View a publication | `/post/[slug]` |
| User profile | `/[username]` |
| Debates | `/debates` |
| Opportunities | `/opportunities` |
| Editorial review queue | `/admin/review` |

## Editorial and admin access

Application roles are `student`, `reviewer`, `editor`, and `admin`. Reviewers can access assigned reviews; editors can manage the editorial workflow; admins have the full administrative capability set. `ADMIN_EMAIL` is a bootstrap-admin mechanism, not the only source of editorial authorization.

## Brand tokens

The maintained visual tokens live in `tailwind.config.ts` and `app/globals.css`. Current core values include deep emerald `#073929`, gold `#CE932B`, purple `#391A60`, warm canvas `#FAF8F5`, and ink `#1A1A1A`.
