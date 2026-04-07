# ThinkAfrika — Product Improvement Prompt for Claude Code

## Project Context

You are working on **ThinkAfrika**, an intellectual social network for African university students.
Built with **Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase (PostgreSQL + Auth)**.

Brand colors:
- Primary: `#10B981` (emerald) — `bg-emerald-brand` / `text-emerald-brand` via Tailwind config
- Secondary: `#F59E0B` (gold/amber)
- Accent: `#7C3AED` (purple)

Key conventions:
- `@/lib/supabase/server` → server component client (`await createClient()`)
- `@/lib/supabase/client` → client component client (`createClient()`)
- `@/lib/utils` → `formatDate`, `MIN_WORD_COUNTS`, `POST_TYPE_LABELS`
- Pages live under `app/(main)/`, auth under `app/(auth)/`
- All new client components need `"use client"` at top
- Tailwind only — no inline styles, no CSS modules
- Never use `any` TypeScript types

**Known database columns (do not alter schema unless a task explicitly says to):**
- `profiles`: id, username, full_name, university, field_of_study, bio, avatar_url, points, interests text[], onboarding_completed, verified boolean, verified_type text
- `posts`: id, author_id, title, slug, content, excerpt, type, status, tags, view_count, created_at, published_at
- `comments`: id, post_id, author_id, parent_id, content, created_at
- `likes`: user_id, post_id

Only create or modify files each task requires. After each task state which files were changed.

---

## Tasks — Implement All 10 in Order

---

### TASK 1 — Activation Loop: First Milestone Tracker

**Goal:** New users who do one meaningful thing in their first session retain at 3–5× the rate of those who don't. Give them a visible progress nudge until they hit the activation milestone.

**Define activation milestone:** A user is "activated" when they have done ALL THREE of:
1. Published at least 1 post (`posts` where `author_id = user.id AND status = 'published'`)
2. Followed at least 1 person (`follows` where `follower_id = user.id`)
3. Joined at least 1 debate (`debate_arguments` where `author_id = user.id`)

**File to create:** `components/ui/ActivationBanner.tsx`

Build this as a server component that accepts:
```ts
interface Props {
  userId: string;
  hasPublished: boolean;
  hasFollowed: boolean;
  hasDebated: boolean;
}
```

Render a horizontal progress banner with 3 checklist items. Each item shows a checkmark (✓ in emerald) if done, or an unfilled circle if not. Include a CTA link per item:
- "Write your first post" → `/write`
- "Follow someone" → `/leaderboard`
- "Join a debate" → `/debates`

When all 3 are complete, show a celebration row: "🎉 You're activated! You've earned your first 10 bonus points." and do NOT show the banner again (add a `hidden` condition when all 3 are true — you can check `hasPublished && hasFollowed && hasDebated`).

Style: white card with emerald left border (`border-l-4 border-emerald-500`), subtle background `bg-emerald-50/40`, shown below the page heading on the home feed.

**File to modify:** `app/(main)/page.tsx`

After fetching the current user, run these 3 parallel queries (only if user is logged in):
```ts
const [
  { count: publishedCount },
  { count: followCount },
  { count: debateCount },
] = await Promise.all([
  supabase.from('posts').select('*', { count: 'exact', head: true })
    .eq('author_id', user.id).eq('status', 'published'),
  supabase.from('follows').select('*', { count: 'exact', head: true })
    .eq('follower_id', user.id),
  supabase.from('debate_arguments').select('*', { count: 'exact', head: true })
    .eq('author_id', user.id),
]);
```

Render `<ActivationBanner>` above the feed (below the "Ideas from across Africa" heading) only when user is logged in AND not all 3 are complete.

---

### TASK 2 — University Dropdown: Curated African Universities

**Goal:** Replace the free-text university field with a searchable dropdown so "Unilag", "University of Lagos", "UNILAG" all become one normalized value.

**File to create:** `components/ui/UniversitySelect.tsx`

Build a client component:
```ts
interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}
```

Internally define a `AFRICAN_UNIVERSITIES` constant array (top 60 African universities — include at minimum these, in alphabetical order):
```
University of Lagos, University of Ibadan, Obafemi Awolowo University,
Ahmadu Bello University, University of Benin, University of Nigeria Nsukka,
Lagos State University, Covenant University, Babcock University,
Joseph Ayo Babalola University, University of Cape Town, Stellenbosch University,
University of Witwatersrand, University of Pretoria, University of Ghana,
Kwame Nkrumah University of Science and Technology, University of Nairobi,
Makerere University, University of Dar es Salaam, Cairo University,
University of Alexandria, Addis Ababa University, University of Khartoum,
Cheikh Anta Diop University, University of Tunis, Mohammed V University,
University of Algiers, Ain Shams University, Assiut University,
University of Zambia, University of Zimbabwe, University of Botswana,
National University of Rwanda, University of Mauritius, University of Abuja,
Federal University of Technology Akure, Nnamdi Azikiwe University,
University of Port Harcourt, Delta State University, Rivers State University,
Kenyatta University, Strathmore University, USIU Africa,
Moi University, Egerton University, University of Limpopo,
Rhodes University, University of KwaZulu-Natal, Nelson Mandela University,
University of the Western Cape, Tshwane University of Technology,
Durban University of Technology, University of Johannesburg,
North-West University, University of the Free State,
Pan-African University, African Leadership University, Other
```

Behavior:
- Renders a `<input type="text">` that filters the list as the user types
- Dropdown appears below the input showing matching universities (max 8 shown)
- Clicking a result sets the value and closes the dropdown
- If the user types something not in the list and blurs, keep their typed value (allow custom entry as fallback)
- Keyboard navigation: arrow keys move selection, Enter confirms, Escape closes
- Close dropdown on outside click

**Files to modify:**
- `app/(main)/onboarding/page.tsx` — replace the university `<input type="text">` with `<UniversitySelect value={form.university} onChange={(v) => setForm({...form, university: v})} />`
- `app/(main)/[username]/page.tsx` — if there's a profile edit form, replace university input there too (check if an edit form exists; if not, skip)

---

### TASK 3 — Author Stats Page

**Goal:** Writers need a feedback loop. Show them how their content is performing.

**File to create:** `app/(main)/stats/page.tsx`

This is a server component. Auth-gate it: if no user, redirect to `/login`.

Fetch for the logged-in user's profile ID, then run these queries in parallel:
```ts
// All their published posts
supabase.from('posts').select('id, title, slug, type, view_count, created_at, published_at')
  .eq('author_id', profileId).eq('status', 'published').order('view_count', { ascending: false })

// Total likes received across all their posts
supabase.from('likes').select('post_id').in('post_id', theirPostIds)

// Follower count
supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profileId)

// Follower count 7 days ago (approximate: followers gained in last 7 days)
supabase.from('follows').select('*', { count: 'exact', head: true })
  .eq('following_id', profileId)
  .gte('created_at', weekAgo)  // new followers this week
```

Render:
1. **4 stat cards at top** (same `StatCard` pattern used in `admin/analytics/page.tsx`):
   - Total views (sum of `view_count` across all posts)
   - Total likes received
   - Total followers
   - New followers this week (show `+N this week` in green if > 0)

2. **Top Posts table** — list all published posts sorted by `view_count` descending:
   - Columns: Title (link to `/post/[slug]`), Type (Badge), Views, Published date
   - Max 10 rows

3. **Points breakdown card** — show current `points` from profile with a tier label:
   - 0–99 → "Contributor"
   - 100–499 → "Scholar"
   - 500–1999 → "Fellow"
   - 2000+ → "Thought Leader"
   Show a progress bar toward the next tier threshold.

**File to modify:** `app/(main)/NavUserMenu.tsx`

Add a "My Stats" link to the dropdown menu (between profile link and sign out), pointing to `/stats`.

Also update `middleware.ts` to add `/stats` to the `protectedPaths` array.

---

### TASK 4 — Points Tiers with Visible Progression

**Goal:** Make points feel meaningful by giving them named tiers with visible progress.

Define the tiers in `@/lib/utils.ts` (add to existing file):
```ts
export const POINT_TIERS = [
  { name: 'Contributor', min: 0, max: 99, color: 'text-gray-600', bg: 'bg-gray-100' },
  { name: 'Scholar', min: 100, max: 499, color: 'text-blue-700', bg: 'bg-blue-100' },
  { name: 'Fellow', min: 500, max: 1999, color: 'text-purple-700', bg: 'bg-purple-100' },
  { name: 'Thought Leader', min: 2000, max: Infinity, color: 'text-amber-700', bg: 'bg-amber-100' },
] as const;

export function getPointTier(points: number) {
  return POINT_TIERS.find(t => points >= t.min && points <= t.max) ?? POINT_TIERS[0];
}

export function getNextTier(points: number) {
  const idx = POINT_TIERS.findIndex(t => points >= t.min && points <= t.max);
  return idx < POINT_TIERS.length - 1 ? POINT_TIERS[idx + 1] : null;
}
```

**File to create:** `components/ui/PointsTierBadge.tsx`

A small inline badge component:
```ts
interface Props { points: number; showProgress?: boolean; }
```
- Renders tier name in a pill badge using the tier's `color` and `bg`
- If `showProgress={true}`, also renders a small progress bar below the badge showing % toward next tier (don't show if at Thought Leader)
- Example: Scholar (340/500 pts) → progress bar at 48%

**Files to modify:**
- `components/profile/ProfileCard.tsx` — replace the raw points display (`{profile.points} pts`) with `<PointsTierBadge points={profile.points} showProgress={true} />`
- `app/(main)/leaderboard/page.tsx` — on each leaderboard row, replace the `{displayPoints.toLocaleString()} pts` text with a compact tier badge + raw number: `<PointsTierBadge points={displayPoints} /> {displayPoints.toLocaleString()}`
- `app/(main)/stats/page.tsx` — already uses this in the points breakdown card (created in Task 3)

---

### TASK 5 — People to Follow: Same University/Field Suggestions

**Goal:** An empty social graph kills engagement. Suggest people worth following immediately after onboarding and on the feed.

**File to create:** `components/ui/SuggestedPeople.tsx`

Server component. Props:
```ts
interface Props {
  currentUserId: string;
  university: string | null;
  fieldOfStudy: string | null;
  limit?: number; // default 3
}
```

Query logic (try in order, take the first that returns results):
1. Same university AND same field: `profiles` where `university = X AND field_of_study = Y AND id != currentUserId`
2. Same university only: `profiles` where `university = X AND id != currentUserId`
3. Fallback: top 3 by points who the current user doesn't already follow

Exclude users the current user already follows:
```ts
const { data: alreadyFollowing } = await supabase
  .from('follows').select('following_id').eq('follower_id', currentUserId);
const excludeIds = [currentUserId, ...(alreadyFollowing?.map(f => f.following_id) ?? [])];
```

Then fetch suggestions excluding those IDs, limit to `props.limit ?? 3`.

Render as a compact card:
- Heading: "People to Follow" with a sub-label showing why ("From your university" or "Top contributors")
- Each person: avatar initial circle, full name, university, follow button
- The follow button is a client component that calls `supabase.from('follows').insert(...)` on click and toggles to "Following ✓" optimistically

**File to modify:** `app/(main)/page.tsx`

Add `<SuggestedPeople>` to the sidebar, between "Top Contributors" and the end of the sidebar div, only when the user is logged in. Fetch the user's `university` and `field_of_study` from their profile (already available in the page if you add it to the profile select).

**File to modify:** `app/(main)/onboarding/page.tsx`

On Step 3 (Welcome screen), below the 3 CTA buttons, add a `<SuggestedPeople>` section. Since this is a client component page, fetch suggestions via a separate client-side `useEffect` call to Supabase after the step renders.

---

### TASK 6 — Featured Post: Editorial Slot

**Goal:** A weekly editorially-picked post gives writers something to aspire to and signals that the platform has a point of view.

**Database:** Add one boolean column. Run this in Supabase SQL Editor (include as a comment block at the top of the file, not in a schema file):
```sql
-- Run in Supabase: ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS featured boolean default false;
```
Assume this column exists.

**File to modify:** `app/(main)/page.tsx`

Add a featured post query:
```ts
const { data: featuredPost } = await supabase
  .from('posts')
  .select('id, title, slug, excerpt, type, published_at, profiles!posts_author_id_fkey(username, full_name, university, avatar_url)')
  .eq('status', 'published')
  .eq('featured', true)
  .order('published_at', { ascending: false })
  .limit(1)
  .single();
```

If `featuredPost` exists, render a `FeaturedPostBanner` above the main feed (above the ActivationBanner). 

**File to create:** `components/post/FeaturedPostBanner.tsx`

Style it distinctively — this should stand out from regular PostCards:
- Gold left border (`border-l-4 border-amber-400`)
- Light amber background (`bg-amber-50`)
- A small "⭐ Featured by ThinkAfrika" label in amber at the top
- Post title as a large link, excerpt below, author info at bottom
- No border-radius removal — keep `rounded-xl`

**File to modify:** `app/(main)/admin/review/page.tsx`

Add a "Feature this post" toggle button next to each approved post in the admin review queue. On click, it updates `posts.featured = true` (and sets all other posts' `featured = false` first, since only one post is featured at a time). This is a server action or a client-side Supabase call — use whichever pattern the existing `ReviewActions.tsx` uses.

---

### TASK 7 — WhatsApp Share: Prominent and First

**Goal:** WhatsApp is the dominant sharing channel in Nigeria and across sub-Saharan Africa. It should be the first and most prominent share option, not missing entirely.

**File to modify:** `app/(main)/post/[slug]/ShareButtons.tsx`

Add WhatsApp as the FIRST button before Twitter/X:
```ts
const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${title} — ${url}`)}`;
```

Style the WhatsApp button with a green background to make it recognizable:
```tsx
<a
  href={whatsappUrl}
  target="_blank"
  rel="noopener noreferrer"
  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium transition-colors"
  aria-label="Share on WhatsApp"
>
  {/* WhatsApp SVG icon */}
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
  WhatsApp
</a>
```

Also make the existing Twitter and LinkedIn buttons show their platform name as text alongside the icon (same pattern as WhatsApp button above — `flex items-center gap-1.5 px-3 py-2`), and move the "Copy link" button to the end. Rename the share section label from "Share:" to "Share this post".

---

### TASK 8 — Comment Upvotes: Surface the Best Responses

**Goal:** On an intellectual platform, the best comment should rise to the top. Add upvotes to comments.

**Database:** Add to Supabase SQL (include as comment at top of file):
```sql
-- Run in Supabase:
-- ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS upvotes integer default 0;
-- CREATE TABLE IF NOT EXISTS public.comment_votes (
--   user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
--   comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
--   PRIMARY KEY (user_id, comment_id)
-- );
```
Assume both exist.

**File to modify:** `app/(main)/post/[slug]/CommentsSection.tsx`

1. Update the `Comment` interface to include `upvotes: number` and `userVoted?: boolean`

2. In the `initialComments` prop fetch (in `post/[slug]/page.tsx`), also fetch `upvotes` field from comments. If user is logged in, fetch their votes:
   ```ts
   // In page.tsx, after fetching comments:
   const commentIds = comments?.map(c => c.id) ?? [];
   let userVotedCommentIds: string[] = [];
   if (user && commentIds.length > 0) {
     const { data: votes } = await supabase
       .from('comment_votes').select('comment_id')
       .eq('user_id', userProfileId).in('comment_id', commentIds);
     userVotedCommentIds = votes?.map(v => v.comment_id) ?? [];
   }
   ```
   Pass `userVotedCommentIds` down to `CommentsSection`.

3. In `CommentsSection.tsx`, for each comment render an upvote button:
   - A small `▲` (upward triangle) button + vote count
   - On click: optimistically increment count + mark as voted, then call:
     ```ts
     // Insert vote
     await supabase.from('comment_votes').insert({ user_id: userId, comment_id: commentId });
     await supabase.from('comments').update({ upvotes: comment.upvotes + 1 }).eq('id', commentId);
     ```
   - If already voted, clicking again removes the vote (toggle behavior)
   - Style voted state: `text-emerald-600` for the arrow, unvoted: `text-gray-400`

4. Sort comments by `upvotes` descending before rendering (keep the existing time-sorted new comments at the bottom).

5. If a comment has `upvotes >= 3`, show a small "Top response" badge next to the author name in amber.

---

### TASK 9 — Daily Brief Widget

**Goal:** Give users a reason to open the app on days they don't write. A lightweight "what's happening today" widget.

**File to create:** `components/ui/DailyBrief.tsx`

Server component. Props:
```ts
interface Props {
  userId: string;
  points: number;
}
```

Fetch in parallel:
```ts
const [
  { data: topPost },       // Most viewed post published today
  { data: hotDebate },     // Debate with most arguments in last 24h
  { data: nextBadge },     // User's points + what next tier needs
] = await Promise.all([
  supabase.from('posts')
    .select('title, slug, view_count, profiles!posts_author_id_fkey(full_name)')
    .eq('status', 'published')
    .gte('published_at', todayStart)
    .order('view_count', { ascending: false })
    .limit(1).single(),

  supabase.from('debates')
    .select('id, title, debate_arguments(count)')
    .in('status', ['open', 'active'])
    .order('created_at', { ascending: false })
    .limit(1).single(),

  // No query needed — use points prop + getPointTier() from utils
]);
```

Render as a compact horizontal card (`flex gap-6`) with 3 sections separated by vertical dividers:
- **Today's Top** — post title (truncated 50 chars) + "X views" + link
- **Hot Debate** — debate title (truncated 40 chars) + "Join →" link
- **Your Progress** — tier name + points + "X pts to [next tier]"

If any section has no data, hide it (don't show an empty slot).

On mobile, stack vertically (`flex-col lg:flex-row`).

**File to modify:** `app/(main)/page.tsx`

Render `<DailyBrief userId={user.id} points={userPoints} />` below the ActivationBanner (or below the page heading if activation is complete), only when user is logged in. Fetch `points` from the user's profile (add `points` to the profile select if not already there).

---

### TASK 10 — Admin Health Metrics

**Goal:** The existing analytics dashboard shows totals. Add a "Product Health" section that shows actionable week-over-week metrics.

**File to modify:** `app/(main)/admin/analytics/page.tsx`

Add a new section at the TOP of the page, above the existing summary cards, titled **"Platform Health"**.

Add these parallel queries (alongside existing ones):

```ts
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

const [
  // 7-day active users (users who published, liked, or commented in last 7 days)
  { data: activeUsersThisWeek },
  // Previous week active users (for comparison)
  { data: activeUsersPrevWeek },
  // Users who published at least 1 post (all time)
  { data: publishedOnce },
  // Total users (already fetched)
  // Avg posts per active user this week
  { data: postsThisWeek },
  // Top 3 universities by contributor count this month
  { data: uniContributors },
] = await Promise.all([
  supabase.from('posts').select('author_id')
    .eq('status', 'published').gte('published_at', sevenDaysAgo),

  supabase.from('posts').select('author_id')
    .eq('status', 'published')
    .gte('published_at', fourteenDaysAgo)
    .lt('published_at', sevenDaysAgo),

  supabase.from('posts').select('author_id')
    .eq('status', 'published'),

  supabase.from('posts').select('author_id, type')
    .eq('status', 'published').gte('published_at', sevenDaysAgo),

  supabase.from('profiles').select('university')
    .not('university', 'is', null),
]);
```

Compute:
- `weeklyActiveUsers` = unique `author_id` count from `activeUsersThisWeek`
- `prevWeekActiveUsers` = unique count from `activeUsersPrevWeek`
- `wowChange` = weeklyActiveUsers - prevWeekActiveUsers (show as +N or -N with color)
- `publishedOncePercent` = (unique authors who ever published / totalUsers * 100).toFixed(1) + "%"
- `avgPostsPerActiveUser` = (postsThisWeek.length / weeklyActiveUsers).toFixed(1)
- `topUniversities` = aggregate `uniContributors` by university, sort desc, take top 3

Render a 4-card health row using a variant of `StatCard` with a trend indicator:

**HealthCard** (create inline in the file):
```tsx
function HealthCard({ label, value, trend, trendLabel }: {
  label: string; value: string | number;
  trend?: 'up' | 'down' | 'neutral'; trendLabel?: string;
}) { ... }
```
- `trend='up'` → green arrow + trendLabel
- `trend='down'` → red arrow + trendLabel
- `trend='neutral'` → gray

4 health cards:
1. **7-Day Active Users** — `weeklyActiveUsers` — trend vs prev week
2. **Published ≥1 Post** — `publishedOncePercent` of all users — no trend needed
3. **Avg Posts / Active User** — `avgPostsPerActiveUser` this week — no trend
4. **Top University** — name of #1 university by contributors — sub-label shows count

Below the health cards, add a **"Top Universities This Month"** mini-table (3 rows): rank, university name, contributor count. Fetch fresh with `gte('created_at', thirtyDaysAgo)` on the `posts` table grouped by author's university.

---

## General Rules

- Never use `any` TypeScript types
- All client components: `"use client"` at top
- All server components: `async/await` with `createClient` from `@/lib/supabase/server`
- Tailwind only — no inline styles
- Accessibility: all interactive elements need `aria-label` or visible text
- After each task, state which files were created or modified
- Do not alter any existing Supabase schema files — SQL notes go as comments in the component file