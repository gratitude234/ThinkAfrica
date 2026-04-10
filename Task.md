# ThinkAfrika — Full Systems Implementation Prompt for Claude Code

Paste this entire prompt into Claude Code from the root of the `think-africa` project.

---

## Context

You are working on **ThinkAfrika** — an intellectual social network for African university students built with **Next.js 14 (App Router), TypeScript, Tailwind CSS, and Supabase**. The stack is:
- Auth & DB: Supabase (server client at `@/lib/supabase/server`, browser client at `@/lib/supabase/client`)
- Editor: TipTap (already installed via `@tiptap/react`, `@tiptap/starter-kit`, etc.)
- Styling: Tailwind CSS with a custom `emerald-brand` color
- Post types: `blog`, `essay`, `research`, `policy_brief`
- Post statuses: `draft`, `pending`, `published`, `rejected`
- All server components use `async/await` with `createClient()` from `@/lib/supabase/server`
- All client components are marked `"use client"` and use `createClient()` from `@/lib/supabase/client`
- The main layout lives at `app/(main)/layout.tsx` with a max-w-6xl container
- User profiles table: `profiles` (id, username, full_name, university, field_of_study, bio, avatar_url, points, interests, verified, verified_type)
- Posts table: `posts` (id, author_id, title, slug, content, excerpt, type, status, tags, pdf_url, view_count, created_at, published_at, featured)

Your job is to implement **11 missing systems** described below. Work through them in order. For each system, make all necessary file changes: new pages, updated components, SQL migrations, and any new npm packages needed.

---

## SYSTEM 1 — Draft Saving + Autosave on Write Page

### Goal
The write page (`app/(main)/write/page.tsx`) currently submits directly to `status: "pending"`. We need:
1. A "Save draft" button that saves to `status: "draft"` in the DB
2. Autosave that fires 3 seconds after the user stops typing (debounced)
3. If a draft `id` exists in the URL (`/write?draft=<uuid>`), load that draft on mount
4. A localStorage fallback that saves `{title, excerpt, content, tags, type}` every 5 seconds as `thinkafrika_draft_backup`
5. A subtle "Saving…" / "Saved" / "Save failed" indicator in the top-right of the write page

### SQL migration needed
```sql
-- drafts already use status='draft' in the existing posts table, no schema change needed
-- Just ensure the posts table allows status='draft' (it already does per schema.sql)
```

### Implementation notes
- Create `app/(main)/write/DraftManager.tsx` — a client component that exports a `useDraftManager` hook
- The hook manages: `draftId`, `lastSaved`, `saveStatus ('idle'|'saving'|'saved'|'error')`
- On mount: check URL param `?draft=<id>`, if present fetch that draft from Supabase and pre-populate the form
- Debounce function: use `useRef` with `setTimeout`/`clearTimeout`, 3000ms delay
- Autosave calls an `async function saveDraft(data)` that does an upsert into `posts` with `status: 'draft'`
- After first save, update the URL to `/write?draft=<id>` using `router.replace` (no page reload)
- The "Submit for review" button changes the saved draft's status from `draft` to `pending` (update, not insert)
- Show a small status pill: gray "Saving…", green "Saved", red "Save failed" — top right of the page header

---

## SYSTEM 2 — Author Dashboard (`/dashboard`)

### Goal
A private `/dashboard` page (redirect to `/login` if not authenticated) that gives writers:
1. **Stats bar** — total views, total likes, total posts published, follower count
2. **Posts table** — all the user's posts (draft, pending, published, rejected) with title, type, status badge, view count, like count, date, and action buttons
3. **Quick actions** — "New post" button, "Edit" button per post (links to `/write?draft=<id>` for drafts, `/edit/<slug>` for published)
4. **Status filter tabs** — All | Published | Pending | Drafts | Rejected

### Files to create
- `app/(main)/dashboard/page.tsx` — server component, fetches all user's posts + stats
- `app/(main)/dashboard/PostsTable.tsx` — client component for the table with filter tabs
- `app/(main)/dashboard/StatsBar.tsx` — server component showing 4 metric cards

### Implementation notes
- Fetch posts with like counts (join `likes` table, group by post_id)
- Fetch follower count from `follows` table where `following_id = user.id`
- Status badge colors: `draft` = gray, `pending` = amber, `published` = green, `rejected` = red
- "Edit" on a published post → `/edit/[slug]`
- "Edit" on a draft → `/write?draft=<id>`
- "Delete" on a draft → confirm dialog, then delete from DB
- Add `/dashboard` link to the nav (in `NavClient.tsx` and `NavUserMenu.tsx`) — visible only when logged in

---

## SYSTEM 3 — Post Editing After Submission (`/edit/[slug]`)

### Goal
Writers can edit their own published or pending posts.

### Files to create
- `app/(main)/edit/[slug]/page.tsx` — server component: fetch the post, verify `author_id === user.id`, render the edit form
- `app/(main)/edit/[slug]/EditForm.tsx` — client component: same form as write page but pre-populated, with a "Save changes" button

### Implementation notes
- The edit form is identical to the write page form (post type selector, title, excerpt, tags, TipTap editor) but pre-populated with existing values
- "Save changes" does a Supabase `update` on the post by `id` — it does NOT change the status (a published post stays published, a pending post stays pending)
- After saving, show a toast/success message and redirect back to `/dashboard`
- If `user.id !== post.author_id`, show a 403 "You don't own this post" message
- Re-use the `Editor` component from `@/components/editor/Editor.tsx` — pass in `content={post.content}` as initial value (the editor already accepts a `content` prop)
- Add autosave here too (every 5 seconds, silently)

---

## SYSTEM 4 — Image Upload in TipTap Editor

### Goal
Add image embedding support to the TipTap editor. Writers can click an image button in the toolbar, select a file, and it uploads to Supabase Storage then embeds in the article.

### Files to modify
- `components/editor/Editor.tsx` — add Image extension + toolbar button
- `app/api/upload-image/route.ts` — new API route that handles the upload

### npm packages needed
```bash
npm install @tiptap/extension-image
```

### Implementation notes

**API route** (`app/api/upload-image/route.ts`):
```typescript
// POST: receives a FormData with field "file"
// Validates: file is image/*, max 5MB
// Uploads to Supabase Storage bucket "post-images" (create this bucket in your Supabase dashboard — set it to public)
// Returns: { url: string }
// Use the service role key via process.env.SUPABASE_SERVICE_ROLE_KEY for the upload
```

**Editor changes**:
- Import `Image` from `@tiptap/extension-image` and add to extensions array
- Add an image toolbar button (use a simple image icon SVG — a rectangle with a mountain/sun inside)
- On click: open a hidden `<input type="file" accept="image/*">`, on file select: show "Uploading…" state, POST to `/api/upload-image`, on success: call `editor.chain().focus().setImage({ src: url }).run()`
- Also support paste: TipTap's Image extension handles `<img>` in pasted HTML automatically

**Supabase Storage**:
- Create a bucket named `post-images` (public read, authenticated write)
- File path pattern: `posts/{userId}/{timestamp}-{filename}`

---

## SYSTEM 5 — Cover Image on Posts

### Goal
Add a cover image field to posts. Writers upload a cover image on the write/edit page. It shows as a header image on the post page and as a thumbnail in PostCard.

### SQL migration needed
```sql
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS cover_image_url text;
```

### Files to modify
- `app/(main)/write/page.tsx` — add cover image upload section above the title field
- `app/(main)/edit/[slug]/EditForm.tsx` — same, pre-populated with existing cover_image_url
- `app/(main)/post/[slug]/page.tsx` — render cover image below the title in the header area
- `components/post/PostCard.tsx` — render cover image as a 16:9 thumbnail at the top of the card
- `components/post/PostCardData` interface — add `cover_image_url?: string | null`

### Implementation notes

**Cover image uploader component** — create `components/ui/CoverImageUploader.tsx`:
- A drag-and-drop area that says "Add a cover image" with a dashed border
- On file select: preview the image immediately (using `URL.createObjectURL`)
- Upload to Supabase Storage bucket `post-images` at path `covers/{userId}/{timestamp}-{filename}`
- Expose `onUpload: (url: string) => void` callback
- Show a "Remove" button if an image is already set

**Post page** (`app/(main)/post/[slug]/page.tsx`):
- If `post.cover_image_url` exists, render it as a full-width `<img>` with `object-fit: cover`, max-height 400px, above the title

**PostCard** (`components/post/PostCard.tsx`):
- If `post.cover_image_url` exists, render a 16:9 `<img>` at the top of the card (above the badge/title)
- The card layout shifts: image → badge → title → excerpt → author footer
- Update the Supabase query in `app/(main)/page.tsx` and all other places that query posts to include `cover_image_url` in the select

---

## SYSTEM 6 — OG / SEO Meta Tags

### Goal
Add dynamic `generateMetadata` to every major page so social shares on WhatsApp, Twitter, and LinkedIn show rich previews.

### Files to modify
- `app/(main)/post/[slug]/page.tsx` — most important
- `app/(main)/[username]/page.tsx`
- `app/(main)/debates/[id]/page.tsx`
- `app/layout.tsx` — update the default metadata

### Implementation notes

**Post page** — add before the default export:
```typescript
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from('posts')
    .select('title, excerpt, cover_image_url, slug, profiles!posts_author_id_fkey(full_name)')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (!post) return { title: 'Post not found — ThinkAfrika' };

  const author = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;

  return {
    title: `${post.title} — ThinkAfrika`,
    description: post.excerpt ?? `Read this post by ${author?.full_name} on ThinkAfrika`,
    openGraph: {
      title: post.title,
      description: post.excerpt ?? '',
      url: `https://thinkafrika.com/post/${post.slug}`,
      siteName: 'ThinkAfrika',
      images: post.cover_image_url ? [{ url: post.cover_image_url, width: 1200, height: 630 }] : [],
      type: 'article',
    },
    twitter: {
      card: post.cover_image_url ? 'summary_large_image' : 'summary',
      title: post.title,
      description: post.excerpt ?? '',
      images: post.cover_image_url ? [post.cover_image_url] : [],
    },
  };
}
```

**Profile page** — similar pattern using `full_name`, `bio`, `avatar_url`

**Root layout** (`app/layout.tsx`) — set default metadata:
```typescript
export const metadata: Metadata = {
  title: 'ThinkAfrika — Africa\'s Intellectual Social Network',
  description: 'Research, essays, and policy briefs from African university students.',
  openGraph: {
    siteName: 'ThinkAfrika',
    images: ['/og-default.png'], // add a default OG image to /public
  },
};
```

---

## SYSTEM 7 — Profile Settings Page (`/settings`)

### Goal
A `/settings` page where users can edit their profile information and manage their account.

### Files to create
- `app/(main)/settings/page.tsx` — server component, fetches current profile, renders the form
- `app/(main)/settings/ProfileForm.tsx` — client component for the editable form
- `app/(main)/settings/AvatarUploader.tsx` — client component for avatar upload

### Form fields
1. **Avatar** — current avatar (initials circle if no image), "Change photo" button → upload to Supabase Storage bucket `avatars/{userId}`
2. **Full name** — text input
3. **Username** — text input (check uniqueness on blur via Supabase query)
4. **Bio** — textarea, max 300 chars with counter
5. **University** — text input (or re-use the existing `UniversitySelect` component at `components/ui/UniversitySelect.tsx`)
6. **Field of study** — text input
7. **Interests** — multi-select tag input (use the existing interests/tags from the onboarding flow for consistency — common African academic topics)
8. **Save changes** button — does a Supabase `update` on `profiles` table

### Implementation notes
- Show a success toast on save
- Username uniqueness check: query `profiles` where `username = newValue AND id != user.id`, if row exists show "Username already taken"
- For interests: render them as clickable pills (similar to the onboarding page) — toggle on/off, save as an array
- Avatar upload: use the same `/api/upload-image` route or a dedicated `/api/upload-avatar` route that uploads to the `avatars` Supabase Storage bucket (public)
- After avatar upload, update `profiles.avatar_url` immediately
- Add `/settings` link to `NavUserMenu.tsx` (the dropdown menu)

---

## SYSTEM 8 — Bookmarks / Save for Later

### Goal
Users can bookmark any post. A `/bookmarks` page shows all their saved posts.

### SQL migration needed
```sql
CREATE TABLE IF NOT EXISTS public.bookmarks (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS bookmarks_user_id_idx ON public.bookmarks(user_id);

-- RLS
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bookmarks" ON public.bookmarks
  FOR ALL USING (auth.uid() = user_id);
```

### Files to create
- `app/(main)/post/[slug]/BookmarkButton.tsx` — client component, bookmark toggle (filled/outline bookmark icon), similar pattern to `LikeButton.tsx`
- `app/(main)/bookmarks/page.tsx` — server component: fetch all bookmarked posts for the current user, render using `PostFeed`

### Files to modify
- `app/(main)/post/[slug]/page.tsx` — query whether user has bookmarked this post, pass to `BookmarkButton`; render `BookmarkButton` next to `LikeButton` in the post header

### Implementation notes
- `BookmarkButton`: on click, toggle bookmark in DB (insert or delete from `bookmarks` table); show count optionally; use a bookmark SVG icon (unfilled = not saved, filled = saved)
- Bookmarks page: if not logged in, redirect to `/login`; if no bookmarks, show empty state "Your saved posts will appear here"
- Add "Bookmarks" link to `NavUserMenu.tsx`

---

## SYSTEM 9 — Full Notifications Page (`/notifications`)

### Goal
The `NotificationBell` component exists but clicking it goes nowhere. Build the full notifications system.

### SQL migration needed
```sql
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'debate_reply', 'post_published', 'post_rejected')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON public.notifications(user_id, read) WHERE read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own notifications" ON public.notifications
  FOR ALL USING (auth.uid() = user_id);
```

### Database triggers to create
```sql
-- Trigger: create notification when a post is liked
CREATE OR REPLACE FUNCTION notify_on_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE author_id uuid;
BEGIN
  SELECT p.author_id INTO author_id FROM public.posts p WHERE p.id = NEW.post_id;
  IF author_id IS NOT NULL AND author_id != NEW.user_id THEN
    INSERT INTO public.notifications (user_id, type, actor_id, post_id)
    VALUES (author_id, 'like', NEW.user_id, NEW.post_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_like_insert AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION notify_on_like();

-- Trigger: create notification when someone follows a user
CREATE OR REPLACE FUNCTION notify_on_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, actor_id)
  VALUES (NEW.following_id, 'follow', NEW.follower_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_follow_insert AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION notify_on_follow();

-- Trigger: create notification when a comment is posted
CREATE OR REPLACE FUNCTION notify_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE author_id uuid;
BEGIN
  SELECT p.author_id INTO author_id FROM public.posts p WHERE p.id = NEW.post_id;
  IF author_id IS NOT NULL AND author_id != NEW.author_id THEN
    INSERT INTO public.notifications (user_id, type, actor_id, post_id, comment_id)
    VALUES (author_id, 'comment', NEW.author_id, NEW.post_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_comment_insert AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION notify_on_comment();
```

### Files to create
- `app/(main)/notifications/page.tsx` — server component: fetch all notifications for user, grouped by date (Today, This week, Earlier), mark all as read on page load
- `app/(main)/notifications/NotificationItem.tsx` — client component: renders one notification row with actor avatar, message text, timestamp, unread dot

### Files to modify
- `components/ui/NotificationBell.tsx` — update to link to `/notifications` and show unread count badge (query `notifications` where `user_id = user.id AND read = false`, count)

### Notification message templates
```
like: "{actor_name} liked your post "{post_title}""
comment: "{actor_name} commented on "{post_title}""
follow: "{actor_name} started following you"
post_published: "Your post "{post_title}" has been published"
post_rejected: "Your post "{post_title}" was not approved"
```

---

## SYSTEM 10 — Subscriber / Follower Count on Profiles

### Goal
Profile pages should show follower and following counts prominently, styled like Substack/Twitter.

### Files to modify
- `app/(main)/[username]/page.tsx` — already fetches `followerCount` and `followingCount`, but they may not be rendered prominently
- `components/profile/ProfileCard.tsx` — update to show follower/following counts as clickable numbers

### Implementation notes
- The profile page already queries `followerCount` and `followingCount` — verify these are passed to `ProfileCard` as props
- In `ProfileCard`, add a row: `**{followerCount}** Followers · **{followingCount}** Following · **{publishedPostCount}** Posts`
- Style these as medium-weight numbers with muted labels (like Twitter's profile stats)
- Make "Followers" and "Following" clickable — link to `/[username]/followers` and `/[username]/following` pages (create simple server components that list the users)
- Also show total view count: sum of `view_count` across all the user's published posts — add to the stats row

---

## SYSTEM 11 — Mobile Experience: Bottom Nav + Mobile Sidebar

### Goal
On mobile, the sidebar (suggested people, trending, debates) is hidden with `hidden lg:block`. Nigerian students use mobile primarily. We need a proper mobile experience.

### Solution A — Bottom navigation bar (most important)
Create a persistent bottom navigation bar visible only on mobile (`block lg:hidden`).

**Files to create**
- `app/(main)/BottomNav.tsx` — client component

**Navigation items** (5 icons in a row):
1. Home (`/`) — house icon
2. Search (`/search`) — magnifying glass
3. Write (`/write`) — pencil/compose icon (center, slightly larger, emerald background circle)
4. Notifications (`/notifications`) — bell icon (with unread badge if applicable)
5. Profile (`/{username}`) — avatar circle (user's initials)

**Styling**:
- Fixed at bottom: `fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200`
- Safe area padding for iOS: `pb-safe` (add `env(safe-area-inset-bottom)` padding)
- Active item gets emerald color
- Add to `app/(main)/layout.tsx` below `<main>` and above `<Footer />`

### Solution B — Mobile feed sidebar as a collapsible section
On the home page, replace the `hidden lg:block` sidebar with a mobile-friendly accordion/tab strip above the feed on small screens.

**Files to modify**
- `app/(main)/page.tsx` — add a `<MobileSidebarStrip>` component above `<PostFeed>` on mobile

**Files to create**
- `app/(main)/MobileSidebarStrip.tsx` — client component:
  - Renders 3 horizontal scroll pills: "🔥 Trending", "⚡ Debates", "🏆 Top Writers"
  - Tapping a pill expands a compact list below it (collapsible, one open at a time)
  - Receives the same data as the desktop sidebar (trending posts, active debates, top contributors)
  - Only visible below `lg` breakpoint

---

## Final checklist — after implementing all systems

1. Run `npm run build` — fix any TypeScript errors
2. Confirm all new Supabase tables have RLS enabled
3. Add all SQL migrations to a new file `supabase/schema_phase5.sql`
4. Update `middleware.ts` to protect: `/dashboard`, `/settings`, `/bookmarks`, `/notifications`, `/write`, `/edit/*`
5. Test the autosave flow: open `/write`, type something, wait 3 seconds, check the `posts` table in Supabase for a `draft` row
6. Test OG tags: use https://opengraph.xyz to verify a published post URL renders correctly
7. Verify the bottom nav renders on mobile viewport (375px width) and doesn't obscure content (add `pb-16 lg:pb-0` to the `<main>` tag in the layout)

---

## Code style rules to follow throughout

- All server components: `export default async function` — no `"use client"` at the top
- All client components: `"use client"` at the very top, before imports
- Supabase server: `const supabase = await createClient()` from `@/lib/supabase/server`
- Supabase client: `const supabase = createClient()` (no await) from `@/lib/supabase/client`
- Always handle the `Array.isArray(post.profiles) ? post.profiles[0] : post.profiles` pattern for Supabase join results
- Use `tailwind` classes only — no inline styles except where unavoidable (e.g. `env(safe-area-inset-bottom)`)
- Loading states: use the existing `SkeletonCard` component at `components/ui/SkeletonCard.tsx`
- Empty states: use the existing `EmptyState` component at `components/ui/EmptyState.tsx`
- Buttons: use the existing `Button` component at `components/ui/Button.tsx`
- Match the existing color palette: primary action color is `emerald-brand` (defined in `tailwind.config.ts`)