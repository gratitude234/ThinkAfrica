Build the ThinkAfrica MVP — Africa's intellectual social network for university students. Tech stack: Next.js (App Router, TypeScript, Tailwind CSS) and Supabase.

## PROJECT OVERVIEW
ThinkAfrica is a platform where African university students can publish research, essays, blog posts, and policy briefs, debate ideas, and build academic profiles. Think: intersection of Medium, LinkedIn, and an academic journal — built for Africa.

---

## 1. PROJECT SETUP
- Scaffold a Next.js 14 app with App Router, TypeScript, and Tailwind CSS
- Install dependencies: @supabase/supabase-js @supabase/ssr @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-placeholder @tiptap/extension-character-count slugify
- Create .env.local with placeholders: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
- Set up Supabase browser and server clients in /lib/supabase/client.ts and /lib/supabase/server.ts using @supabase/ssr

---

## 2. FOLDER STRUCTURE
Create this structure:
/app
  /(auth)/login/page.tsx
  /(auth)/signup/page.tsx
  /(main)/page.tsx                  ← Home feed
  /(main)/write/page.tsx            ← Post editor
  /(main)/[username]/page.tsx       ← Public profile
  /(main)/post/[slug]/page.tsx      ← Single post view
  /(main)/admin/review/page.tsx     ← Editorial review queue
/components
  /editor/Editor.tsx
  /post/PostCard.tsx
  /post/PostFeed.tsx
  /profile/ProfileCard.tsx
  /ui/Button.tsx
  /ui/Badge.tsx
  /ui/Tag.tsx
/lib
  /supabase/client.ts
  /supabase/server.ts
  /utils.ts

---

## 3. SUPABASE SCHEMA
Generate a single SQL file at /supabase/schema.sql with the following tables:

profiles (id uuid PK → auth.users, username text unique, full_name text, university text, field_of_study text, bio text, avatar_url text, points int default 0, created_at timestamptz)

posts (id uuid PK, author_id → profiles, title text, slug text unique, content text, excerpt text, type text CHECK IN ('blog','essay','research','policy_brief'), status text default 'draft' CHECK IN ('draft','pending','published','rejected'), tags text[], pdf_url text, view_count int default 0, created_at timestamptz, published_at timestamptz)

comments (id uuid PK, post_id → posts, author_id → profiles, parent_id → comments nullable, content text, created_at timestamptz)

likes (user_id → profiles, post_id → posts, PRIMARY KEY (user_id, post_id))

follows (follower_id → profiles, following_id → profiles, PRIMARY KEY (follower_id, following_id))

badges (id uuid PK, name text, description text, icon text)

user_badges (user_id → profiles, badge_id → badges, awarded_at timestamptz, PRIMARY KEY (user_id, badge_id))

Also include:
- A trigger function handle_new_user() that auto-inserts into profiles on auth.users insert
- RLS policies: users can read all published posts, only authors can update their own posts, only authenticated users can insert posts and comments

---

## 4. AUTH PAGES
Build /app/(auth)/signup/page.tsx and /app/(auth)/login/page.tsx:
- Clean forms with email + password fields
- On signup: collect full_name and university, pass as user metadata
- Use Supabase createClient from /lib/supabase/client.ts
- Redirect to / on success
- Show inline error messages
- Include a link between login and signup pages

---

## 5. HOME FEED — /app/(main)/page.tsx
- Fetch all published posts from Supabase, joined with author profile (username, university, avatar_url)
- Render using PostCard component
- Filter bar at the top: All | Blog | Essay | Research | Policy Brief
- Filtering is client-side using useState
- PostCard shows: title, excerpt, author name + university, post type badge, tags, date, like count

---

## 6. POST EDITOR — /app/(main)/write/page.tsx
- Protected route: redirect to /login if not authenticated
- Post type selector: Blog | Essay | Research | Policy Brief (styled as tab buttons)
- Fields: Title input, Tags input (comma separated, converts to array), Tiptap rich text editor for content
- Show live word count using Tiptap CharacterCount extension
- Show minimum word count requirement per type: Blog 200, Essay 800, Research 3000, Policy Brief 500
- On submit: generate slug from title using slugify, set status to 'pending', insert into posts table
- Show success message after submission: "Your post has been submitted for editorial review"

---

## 7. SINGLE POST — /app/(main)/post/[slug]/page.tsx
- Fetch post by slug with author profile
- Render full content, author info, tags, post type badge, published date
- Like button (toggle, requires auth)
- Comments section: list existing comments, textarea to add new comment (requires auth)
- Increment view_count on load using a Supabase RPC function

---

## 8. USER PROFILE — /app/(main)/[username]/page.tsx
- Fetch profile by username
- Show: avatar, full name, university, field of study, bio, points, badges
- List all published posts by this user using PostCard
- Follow/Unfollow button (requires auth, checks follows table)

---

## 9. EDITORIAL REVIEW QUEUE — /app/(main)/admin/review/page.tsx
- Fetch all posts with status = 'pending', joined with author profile
- Show each post: title, type, author, excerpt, submitted date
- Two action buttons per post: Approve (sets status to 'published', sets published_at to now()) and Reject (sets status to 'rejected')
- Simple admin check: only show page if logged-in user's email matches a hardcoded ADMIN_EMAIL env variable

---

## 10. DESIGN SYSTEM
Use these brand colors throughout (as Tailwind config or CSS variables):
- Emerald Green (primary): #10B981
- Gold (secondary): #F59E0B  
- Purple (accent): #7C3AED
- Background: white / gray-50
- Text: gray-900

Post type badges should be color-coded:
- Blog → gray
- Essay → emerald
- Research → purple
- Policy Brief → gold

The UI should feel clean, credible, and academic — not a casual social feed. Generous whitespace, clear typography, professional card layouts.

---

## WHAT TO GENERATE
1. All files listed in the folder structure above with working code
2. /supabase/schema.sql ready to paste into Supabase SQL editor
3. All Supabase queries written using the typed supabase client
4. Middleware at /middleware.ts for protecting authenticated routes
5. A README.md with setup steps

Make sure everything is wired together and consistent. Use server components where possible and client components only where interactivity is needed.