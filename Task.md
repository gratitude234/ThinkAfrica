# ThinkAfrika — 3 Quick Changes

## CHANGE 1 — Remove footer from authenticated layout, keep it on landing only

**File: `app/(main)/layout.tsx`**
- Remove the `<Footer />` component and its import entirely from this file

**File: `app/(main)/landing/page.tsx`**
- Import `Footer` from `@/components/ui/Footer` and render it at the bottom of the landing page JSX, after the CTA section

---

## CHANGE 2 — Add the ThinkAfrika logo to the nav

**File: `public/logo.png`**
- The logo file already exists at this path (the developer has placed it there)

**File: `app/(main)/NavClient.tsx`**
- Import `Image` from `"next/image"`
- Find wherever the site name "ThinkAfrika" (or "ThinkAfrica") is rendered as text inside the nav's home `<Link>` and replace it with:
```tsx
<Image
  src="/logo.png"
  alt="ThinkAfrika"
  width={160}
  height={48}
  priority
  className="h-9 w-auto"
/>
```

**File: `app/(main)/landing/page.tsx`**
- Import `Image` from `"next/image"`
- At the top of the hero `<section>`, before the `<h1>`, add:
```tsx
<Image
  src="/logo.png"
  alt="ThinkAfrika"
  width={240}
  height={72}
  className="h-16 w-auto mx-auto mb-6"
/>
```

**File: `app/layout.tsx`**
- Add favicon to the metadata export:
```tsx
icons: {
  icon: "/logo.png",
},
```

---

## CHANGE 3 — Remove admin review gate, posts go live instantly

**File: `app/(main)/write/page.tsx`**
- In the `handleSubmit` function, find the `supabase.from("posts").insert({...})` call
- Change `status: "pending"` to `status: "published"`
- Add `published_at: new Date().toISOString()` to the insert object

- Find the success screen JSX (the one that renders after `success === true`) and update it:
  - Change the heading from "Submitted for review" to "Your post is live!"
  - Change the subtext from anything about "editorial review" / "approved" to: `"Your post has been published and is now visible to the community."`
  - Add a "View post" button that links to `/post/${slug}` — you'll need to store the returned slug in state after the insert. Capture it: `const { data: inserted } = await supabase.from("posts").insert({...}).select("slug").single()` then `setSlug(inserted.slug)`
  - Add a `slug` state variable: `const [slug, setSlug] = useState<string | null>(null)`

**File: `app/(main)/admin/review/page.tsx`**
- Find the page title (likely "Review Queue" or similar) and change it to "Moderation Queue"
- Find any description text about posts "awaiting review before publishing" and replace it with: "Posts are published instantly. Flagged posts appear here for moderation."
- Change the query that fetches posts: instead of `.eq("status", "pending")`, change it to fetch posts that have been flagged. Since a `flagged` field doesn't exist yet on the posts table, for now just show ALL published posts ordered by newest, with a note at the top: "Review panel repurposed for moderation. Connect a reporting system to filter flagged content."
- Keep the existing `FeaturePostButton` and any other admin actions — those are still useful

**File: `app/(main)/admin/review/ReviewActions.tsx`**
- Find any "Approve" / "Publish" action button and remove it (posts are now auto-published, there's nothing to approve)
- Keep "Reject" / "Unpublish" and "Feature" actions — rename "Reject" to "Unpublish" if it currently says "Reject"