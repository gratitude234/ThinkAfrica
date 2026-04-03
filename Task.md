Continue building the ThinkAfrica platform. The Phase 1 MVP (auth, profiles, post editor, feed, single post, admin review queue) is already built. Now implement Phase 2 features.

Tech stack: Next.js 14 (App Router, TypeScript, Tailwind CSS) + Supabase.
Brand colors: Primary #10B981 (emerald), Secondary #F59E0B (gold), Accent #7C3AED (purple).

---

## 1. DATABASE — Add to Supabase schema

Generate a file at /supabase/schema_phase2.sql with these new tables:

debates (
  id uuid PK default gen_random_uuid(),
  title text not null,
  description text,
  moderator_id uuid → profiles,
  status text default 'open' CHECK IN ('open', 'active', 'closed'),
  round_duration_minutes int default 5,
  tags text[],
  created_at timestamptz default now(),
  ends_at timestamptz
)

debate_arguments (
  id uuid PK default gen_random_uuid(),
  debate_id uuid → debates,
  author_id uuid → profiles,
  content text not null,        -- 200-300 words max
  round_number int default 1,
  upvotes int default 0,
  created_at timestamptz default now()
)

debate_votes (
  user_id uuid → profiles,
  argument_id uuid → debate_arguments,
  PRIMARY KEY (user_id, argument_id)
)

notifications (
  id uuid PK default gen_random_uuid(),
  user_id uuid → profiles,
  type text,                   -- 'like', 'comment', 'follow', 'debate_reply', 'post_approved'
  message text,
  read boolean default false,
  link text,
  created_at timestamptz default now()
)

Add RLS policies:
- Anyone can read open/active debates and arguments
- Only authenticated users can insert arguments
- Users can only read their own notifications
- Users can only update their own notifications (mark as read)

---

## 2. DEBATES FEATURE

### /app/(main)/debates/page.tsx — Debates Feed
- Fetch all debates from Supabase ordered by created_at desc
- Show debate cards: title, tags, status badge (Open/Active/Closed), argument count, time remaining
- "Start a Debate" button (authenticated users only) → opens modal or redirects to /debates/create
- Filter by status: All | Open | Active | Closed

### /app/(main)/debates/create/page.tsx — Create Debate
- Protected route (auth required)
- Fields: Title, Description, Tags (comma separated), Round Duration (minutes selector: 5, 10, 15)
- On submit: insert into debates table with status 'open'
- Redirect to the new debate page after creation

### /app/(main)/debates/[id]/page.tsx — Single Debate
- Fetch debate + all arguments joined with author profile
- Show debate title, description, status, tags, time remaining if active
- Arguments list: grouped by round, each showing author avatar, name, university, content, upvote count
- Upvote button per argument (toggle, auth required) — updates debate_votes table and increments upvotes count
- Argument submission form at bottom (auth required):
  - Textarea with live word count (max 300 words, enforced)
  - Submit adds to debate_arguments with current round number
  - Disabled if debate status is 'closed'
- Use Supabase Realtime to subscribe to new arguments so they appear live without page refresh

---

## 3. NOTIFICATIONS SYSTEM

### /components/ui/NotificationBell.tsx
- Bell icon in the navbar showing unread count badge
- Dropdown on click showing last 10 notifications
- Each notification shows: message, time ago, link to relevant content
- "Mark all as read" button
- Fetches from notifications table filtered by current user

### Trigger notifications automatically when:
- A post gets approved (status changes to 'published') → notify the author
- Someone likes your post → notify the post author
- Someone comments on your post → notify the post author
- Someone follows you → notify the followed user
- Someone replies in a debate you participated in → notify participants

Implement these as Supabase database functions / triggers in schema_phase2.sql

---

## 4. GAMIFICATION — Points System

### Points rules (implement as Supabase triggers in schema_phase2.sql):
- Publishing a blog post → +10 points
- Publishing an essay → +20 points  
- Publishing a research paper → +50 points
- Publishing a policy brief → +30 points
- Receiving a like → +2 points
- Winning a debate (most upvotes) → +25 points
- Comment on a post → +3 points

Create a trigger update_user_points() that fires on relevant table inserts/updates and updates profiles.points accordingly.

### /app/(main)/leaderboard/page.tsx — Leaderboard
- Fetch top 20 profiles ordered by points desc
- Show rank number, avatar, name, university, points, badge count
- Weekly tab and All-time tab (weekly requires a weekly_points column or computed from created_at)
- Highlight the current logged-in user's row

### Auto-award badges (add to schema_phase2.sql as triggers):
- "First Post" → awarded when user publishes their first post
- "Researcher" → awarded when user publishes a research paper
- "Policy Maker" → awarded when user publishes a policy brief
- "Debate Champion" → awarded when user wins a debate
- "Rising Star" → awarded when user reaches 100 points
- "Thought Leader" → awarded when user reaches 500 points

---

## 5. ENHANCED PROFILE PAGE

Update /app/(main)/[username]/page.tsx:
- Add a stats row: Total Posts | Total Likes Received | Points | Followers count
- Show badges in a visual grid with icons and names (use emoji or lucide icons as badge icons)
- Add tabs: Posts | Debates | Activity
  - Posts tab: their published posts (already exists)
  - Debates tab: debates they've participated in
  - Activity tab: recent likes, comments, and debate arguments

---

## 6. ENHANCED HOME FEED

Update /app/(main)/page.tsx:
- Add a sidebar (desktop only):
  - "Trending This Week" — top 5 posts by view_count in last 7 days
  - "Active Debates" — 3 most recent open debates with argument count
  - "Top Contributors" — top 3 profiles by points this week with avatars
- The sidebar should be sticky on scroll

---

## 7. SEARCH — /app/(main)/search/page.tsx
- Search input at the top
- Searches posts (title, excerpt, tags) and profiles (username, full_name, university) simultaneously using Supabase full-text search or ilike queries
- Results split into two sections: Articles and People
- Each result links to the relevant post or profile page

---

## 8. NAVBAR UPDATES

Update the main navbar component to include:
- ThinkAfrica logo (left)
- Nav links: Feed | Debates | Leaderboard (center)
- Search icon → expands inline search or goes to /search
- Notification bell with unread count (NotificationBell component)
- User avatar dropdown: Profile | Write | Admin (if admin) | Sign Out (right)
- Mobile: hamburger menu with all links

---

## WHAT TO GENERATE
1. All new page and component files with working code
2. /supabase/schema_phase2.sql with all new tables, triggers, functions, and RLS policies
3. Updated navbar component
4. Supabase Realtime subscription in the debate page for live argument updates
5. All Supabase queries using typed client

Make sure everything integrates cleanly with the existing Phase 1 codebase. Do not recreate files that already exist — only add or update what is needed for Phase 2.