I have a Next.js 14 app (ThinkAfrika) where clicking links feels slow — pages take a while to load before anything appears. I need you to fix the navigation performance. Here's what to do:

1. **Add `loading.tsx` files** in every route folder under `app/(main)/` that doesn't already have one. Each loading file should export a skeleton UI using Tailwind CSS that matches the page shape (e.g., skeleton cards for feed, skeleton profile for user pages). This gives instant visual feedback on navigation.

2. **Wrap slow data fetches in `<Suspense>`** inside the main page components, especially:
   - `app/(main)/page.tsx` (the home feed — wrap the posts list in Suspense with a skeleton fallback)
   - `app/(main)/[username]/page.tsx` (profile page — wrap tabs/content in Suspense)
   - `app/(main)/post/[slug]/page.tsx` (post page — wrap comments in Suspense)
   - `app/(main)/debates/page.tsx` and `app/(main)/leaderboard/page.tsx`

3. **Split heavy Server Components** — In `app/(main)/page.tsx`, extract the posts-fetching logic into a separate async component (e.g., `<PostsFeed />`) so the page shell renders immediately and posts stream in.

4. **Check all `<Link>` components** across the app — make sure none of them have `prefetch={false}`. Next.js 14 prefetches Link components in the viewport by default; don't disable it.

5. **Add `export const dynamic = 'force-dynamic'`** only where truly needed (real-time data). For pages that can be cached, remove it if present — unnecessary dynamic rendering slows everything down.

6. **In `app/(main)/layout.tsx`**, make sure the layout itself doesn't await any slow fetches before rendering — move any user-session fetches to use `cookies()` or `headers()` lazily.

The goal: every page should render its shell/skeleton instantly on click, then stream in the real data. No page should feel "blank" during navigation.