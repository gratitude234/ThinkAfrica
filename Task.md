Continue building the ThinkAfrica platform. Phases 1, 2, and 3 are already built (auth, profiles, posts, debates, gamification, notifications, leaderboard, search, webinars, campus ambassadors, policy hub, onboarding, reading experience, static pages).

Now implement Phase 4: Monetization, Fellowship Programs, Institutional Partnerships Dashboard, and Platform Maturity features.

Tech stack: Next.js 14 (App Router, TypeScript, Tailwind CSS) + Supabase.
Brand colors: Primary #10B981 (emerald), Secondary #F59E0B (gold), Accent #7C3AED (purple).

---

## 1. DATABASE — Add to /supabase/schema_phase4.sql

fellowships (
  id uuid PK default gen_random_uuid(),
  title text not null,
  description text,
  sponsor_name text,
  sponsor_logo_url text,
  amount text,                        -- e.g. "$500 grant" or "Fully funded"
  eligibility text,
  deadline timestamptz,
  application_url text,
  status text default 'open' CHECK IN ('open', 'closed'),
  created_at timestamptz default now()
)

fellowship_applications (
  id uuid PK default gen_random_uuid(),
  fellowship_id uuid → fellowships,
  user_id uuid → profiles,
  cover_letter text,
  status text default 'pending' CHECK IN ('pending', 'shortlisted', 'accepted', 'rejected'),
  applied_at timestamptz default now()
)

institutional_partners (
  id uuid PK default gen_random_uuid(),
  name text not null,
  type text CHECK IN ('university', 'ngo', 'government', 'thinktank', 'media'),
  country text,
  logo_url text,
  description text,
  website_url text,
  partnership_since timestamptz default now(),
  active boolean default true
)

talent_profiles (
  id uuid PK default gen_random_uuid(),
  user_id uuid → profiles unique,
  open_to_opportunities boolean default false,
  opportunity_types text[],           -- ['internship', 'research', 'fellowship', 'job']
  cv_url text,
  linkedin_url text,
  skills text[],
  visibility text default 'public' CHECK IN ('public', 'partners_only', 'private'),
  updated_at timestamptz default now()
)

talent_inquiries (
  id uuid PK default gen_random_uuid(),
  talent_id uuid → talent_profiles,
  organization_name text,
  contact_email text,
  message text,
  created_at timestamptz default now()
)

sponsor_placements (
  id uuid PK default gen_random_uuid(),
  sponsor_name text,
  placement_type text CHECK IN ('fellowship', 'webinar', 'leaderboard', 'policy_hub'),
  content text,
  link_url text,
  active boolean default true,
  created_at timestamptz default now()
)

Add RLS:
- Anyone can read open fellowships and institutional_partners
- Authenticated users can insert fellowship_applications
- Users can only read their own fellowship_applications
- Users can read/update their own talent_profile
- Public talent_profiles visible to all; partners_only visible only to authenticated users
- Only admins can insert/update fellowships, institutional_partners, sponsor_placements

---

## 2. FELLOWSHIP PROGRAMS

### /app/(main)/fellowships/page.tsx — Fellowships Feed
- Hero: "Funding Africa's Next Generation of Thinkers"
- Cards for each open fellowship: title, sponsor name + logo, amount, deadline, eligibility summary, "Apply Now" button
- Closed fellowships shown in a separate "Past Opportunities" section below
- Filter by deadline: Closing Soon | All

### /app/(main)/fellowships/[id]/page.tsx — Single Fellowship
- Full fellowship details: title, sponsor, amount, eligibility, description, deadline
- "Apply for this Fellowship" button (auth required)
- Opens an inline application form:
  - Cover letter textarea (min 200 words, live word count)
  - On submit: insert into fellowship_applications
  - Show confirmation after applying
- If user already applied: show application status badge (Pending / Shortlisted / Accepted / Rejected)

### /app/(main)/admin/fellowships/page.tsx — Admin: Manage Fellowships
- Admin only
- List all fellowship applications grouped by fellowship
- For each application: applicant name, university, cover letter preview, status
- Update status buttons: Shortlist | Accept | Reject
- "Add New Fellowship" form at top: all fields from fellowships table
- On submit: insert new fellowship

---

## 3. INSTITUTIONAL PARTNERSHIPS

### /app/(main)/partners/page.tsx — Partners Page
- Hero: "Institutions That Believe in African Student Scholarship"
- Grid of active partner logos + names + country + type badge
- Partner types color-coded: University (emerald), NGO (gold), Government (purple), Think Tank (gray), Media (blue)
- "Become a Partner" section at bottom with a contact form (name, organization, email, message) — inserts into a simple contact_requests table

### /app/(main)/admin/partners/page.tsx — Admin: Manage Partners
- Admin only
- List all partners with edit/deactivate buttons
- "Add Partner" form: all fields from institutional_partners table
- Toggle active/inactive status

---

## 4. TALENT PIPELINE

### /app/(main)/talent/page.tsx — Talent Directory
- Hero: "Discover Africa's Brightest Student Minds"
- Search/filter by: skills, opportunity type, university, country
- Grid of public talent profiles: avatar, name, university, skills tags, opportunity types badges
- Each card links to their ThinkAfrica profile /[username]
- Note: partners_only profiles only visible to authenticated users

### Update /app/(main)/[username]/page.tsx
- Add "Opportunities" tab to profile page tabs (alongside Posts, Debates, Activity)
- In the tab: show talent_profile settings if viewing own profile — toggle "Open to Opportunities", select opportunity types, add skills, CV URL, LinkedIn URL
- If viewing another user's public talent profile: show their opportunity preferences and a "Send Inquiry" button
- "Send Inquiry" opens a modal: organization name, contact email, message → inserts into talent_inquiries

---

## 5. MONETIZATION — SPONSOR PLACEMENTS

### Update layout to show sponsor placements contextually:
- On /leaderboard: show one sponsor banner at the top (from sponsor_placements where placement_type = 'leaderboard')
- On /policy: show one sponsor banner (placement_type = 'policy_hub')
- On /webinars: show one sponsor banner (placement_type = 'webinar')
- Sponsor banners are clean, labeled "Supported by [Sponsor Name]", linking to sponsor URL
- Only show if an active placement exists for that page

### /app/(main)/admin/sponsors/page.tsx — Admin: Manage Sponsors
- Admin only
- List all sponsor placements with active/inactive toggle
- "Add Sponsor Placement" form: sponsor name, placement type selector, content, link URL
- On submit: insert into sponsor_placements

---

## 6. ANALYTICS DASHBOARD (ADMIN)

### /app/(main)/admin/analytics/page.tsx
- Admin only
- Summary cards at top:
  - Total registered users
  - Total published posts (broken down by type)
  - Total debates created
  - Total webinars hosted
  - Total fellowship applications
  - Total page views (sum of view_count from posts)
- Charts using recharts library:
  - Line chart: new user signups over the last 30 days (group profiles.created_at by day)
  - Bar chart: posts published per content type (blog, essay, research, policy_brief)
  - Bar chart: top 10 universities by contributor count
- All data fetched directly from Supabase using aggregate queries

---

## 7. CONTRIBUTOR VERIFICATION BADGES

### Add to /supabase/schema_phase4.sql:
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified boolean default false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified_type text CHECK IN ('student', 'researcher', 'faculty', 'institution');

### Update ProfileCard and post author displays:
- Show a small verified checkmark (✓) badge next to name if verified = true
- Badge color based on verified_type: student (emerald), researcher (purple), faculty (gold), institution (blue)

### /app/(main)/admin/verification/page.tsx
- Admin only
- List users who have published 3+ posts (likely serious contributors)
- Toggle verified on/off, set verified_type
- Show their post count, points, university

---

## 8. EMAIL DIGEST (SETUP ONLY — no actual email sending)

### /app/(main)/admin/digest/page.tsx
- Admin only
- "Weekly Digest Preview" page
- Shows what the weekly email digest would contain:
  - Top 5 posts of the week (by view_count in last 7 days)
  - Top debate of the week (most arguments)
  - Upcoming webinars
  - New fellowship opportunities
  - Top contributor of the week (highest points gained)
- "Send Digest" button — for now just shows a success toast (actual email integration left for Phase 5)

---

## 9. PLATFORM POLISH

### Loading States
- Add skeleton loading components for: PostCard, ProfileCard, DebateCard, WebinarCard
- Use them in all feed pages while data is fetching

### Empty States
- Add proper empty state components for all feed pages:
  - No posts: "No articles yet. Be the first to write."
  - No debates: "No debates yet. Start one."
  - No webinars: "No webinars scheduled yet."
  - No fellowships: "No open fellowships right now. Check back soon."
- Each empty state includes an icon, message, and a CTA button

### Error Boundary
- Add a global error boundary component at /components/ui/ErrorBoundary.tsx
- Shows a friendly error page with a "Try Again" button instead of a blank crash

### /app/not-found.tsx
- Custom 404 page
- ThinkAfrica branded with logo
- Message: "This page doesn't exist — but your ideas do."
- Links back to Feed and Debates

---

## WHAT TO GENERATE
1. All new page and component files with working code
2. /supabase/schema_phase4.sql with all new tables, columns, and RLS policies
3. Recharts analytics dashboard with real Supabase aggregate queries
4. Skeleton and empty state components
5. Custom 404 page
6. All Supabase queries using typed client

Do not recreate Phase 1, 2, or 3 files. Only add or update what Phase 4 requires. Keep all styling consistent with the existing brand.