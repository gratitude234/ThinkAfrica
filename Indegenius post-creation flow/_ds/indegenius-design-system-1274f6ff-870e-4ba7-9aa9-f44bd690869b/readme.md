# Indegenius Design System

Indegenius is Africa's intellectual social network and academic credentialing/publishing
platform for university students: essays, research papers, policy briefs, and blog-style
"quick takes," plus structured debates, follower/profile credentialing, and an
opportunities (fellowships/scholarships) hub. Tone throughout is **serious, editorial, and
trustworthy** — closer to a policy journal or student newspaper than a social feed.

This design system was built by reading the product's real Next.js/Tailwind codebase, not
by guessing from screenshots. It packages the brand's actual tokens, fonts, logos, and UI
patterns for reuse in prototypes, decks, and new features.

## Sources

- **GitHub repo (primary source of truth):** [github.com/gratitude234/ThinkAfrica](https://github.com/gratitude234/ThinkAfrica)
  (product code name "ThinkAfrica"; ships under the brand name **Indegenius**). Explore this
  repo further for anything this design system doesn't cover — full page implementations,
  the Supabase schema, the debate/editorial-review state machines, etc.
  - `app/globals.css`, `tailwind.config.ts` — color tokens, font variables
  - `app/layout.tsx` — font loading (Bodoni Moda + Inter via next/font/google)
  - `components/ui/*` — reusable UI primitives (source of the component inventory below)
  - `app/(marketing)/landing/page.tsx` — marketing site
  - `app/(main)/page.tsx`, `BottomNav.tsx`, `NavClient.tsx`, `HomeSidebar.tsx` — home feed app shell
  - `app/(main)/debates/*` — debate platform
  - `components/profile/*` — profile/credentialing screens
  - `public/brand/*.svg`, `public/brand/README.md` — logo asset pack
- No Figma file was attached for this project.

## Products represented

1. **Marketing website** (`app/(marketing)/landing`) — public landing page for logged-out
   visitors: hero, stats bar, latest-posts grid, topic browser, debates teaser, dual CTA.
2. **App** (`app/(main)`) — the logged-in product: home feed (tabs for home/following/latest),
   debates (live motion voting + arguments), profiles (credentials, stats, publications),
   opportunities hub, messaging, notifications. Mobile-first responsive web, not a native app.

## Components

Built from the real `components/ui/*` inventory in the source repo — every primitive below
has a direct source-file counterpart, grouped by concern:

- **core/** — `Button`, `Badge`, `Pill`, `Tag`
- **feedback/** — `Toast`, `EmptyState`, `SkeletonCard`
- **data-display/** — `UserAvatar`, `PointsTierBadge`
- **actions/** — `FollowButton`, `IconButton`

### Intentional additions
- **IconButton** — the source repo inlines this exact icon-button markup repeatedly
  (NavClient, BottomNav, NotificationBell) but never extracts it as its own component.
  Added here as a reusable primitive since consumers will need it constantly for nav/toolbars.

Not built (no source counterpart, and not invented): generic Toast severity variants,
Select/Checkbox/Radio/Switch/Dialog/Tabs/Tooltip/Avatar-group — the product doesn't use
these patterns anywhere in the reviewed code.

## UI Kits

- `ui_kits/marketing/` — landing page recreation (hero, stats, latest posts, topics, debates
  teaser, dual CTA, footer)
- `ui_kits/app/` — home feed, debates, and profile screens with working tab navigation

## Index / manifest

```
tokens/            colors.css, typography.css, spacing.css, fonts.css
styles.css          root stylesheet — imports every token file
assets/logos/        Indegenius logo lockups (color + white, full/icon/wordmark)
guidelines/          foundation specimen cards (Colors, Type, Spacing, Brand, Iconography, Motion)
components/core/           Button, Badge, Pill, Tag
components/feedback/       Toast, EmptyState, SkeletonCard
components/data-display/   UserAvatar, PointsTierBadge
components/actions/        FollowButton, IconButton
ui_kits/marketing/    landing page recreation
ui_kits/app/          home feed / debates / profile recreation
SKILL.md              Claude Code–compatible skill wrapper for this design system
```

---

## Content fundamentals

**Voice:** serious and editorial, never playful. Indegenius writes like a policy journal or
academic newspaper describing its own features, not a consumer social app. No emoji anywhere
in UI copy (the one component with an optional `icon` prop for EmptyState is unused in
practice). No exclamation points in system copy. Sentence case for body copy and buttons;
Title Case reserved for nav labels and section eyebrows (which are also uppercase + letter-spaced).

**Point of view:** second person for onboarding/CTA moments ("Claim your handle", "Start
reading", "your profile"), third person/neutral for descriptive UI ("Someone liked your
post", "Recognition", "Portfolio metrics"). Never first-person ("I", "we") in interface copy.

**Real examples from the codebase:**
- Hero: *"Where Africa's best student ideas live."*
- Sub-head: *"Essays, research, and policy briefs written by university students across
  Africa, rigorously argued and openly published."*
- Value prop: *"Follow credible writers — Author profiles show university, field of study,
  peer-review history, and point tier — so you can decide whose work is worth tracking."*
- Empty state: *"No articles yet. Be the first to share your ideas with Africa."*
- Debate section: *"Argue the motion. Move the debate."*
- Section eyebrow style: *"REAL WORK, REAL BYLINES"*, *"HOW IT WORKS"*, *"ACADEMIC SIGNAL"*

**Vocabulary discipline:** the product uses precise academic/editorial nouns consistently —
"publications" not "posts" on profiles, "citable"/"reviewed" not "verified content",
"arguments" not "comments" inside a debate, "motion" for a debate's proposition, "quick
take" for the shortest post type, "co-authored" not "collaborated". Reuse this vocabulary
exactly; don't paraphrase it into generic social-app language.

**Numbers & stats:** real counts are always formatted (`1.2k`, `4.1m`), never raw when
large. Stats are presented plainly (no exclamation, no "wow" framing) — "142 Universities
represented", "38 African countries", "412 votes".

**Microcopy tone for system states:** matter-of-fact and specific, e.g. "First publication
on Indegenius. Worth catching early." / "No motion votes yet. Be one of the first voices
in." — informative, slightly encouraging, never cutesy.
<!-- CONTENT_FUNDAMENTALS -->

## Visual foundations

**Color:** a warm, restrained palette anchored by a very deep forest green
(`#073929`), gold (`#CE932B`), and a deep purple (`#391A60`) — never the brighter
Tailwind emerald-500 (`#10B981`) as the *brand* color, though that brighter emerald scale
does appear as a secondary/utility accent (progress bars, small live-status dots, chip
tints) alongside standard purple/amber/sky/blue/gray Tailwind scales for badges and signal
chips. Backgrounds are warm off-white (`#FAF8F5`), never pure white or pure gray — cards
sit on canvas as pure white (`#FFFFFF`) panels for contrast. Dark sections (footer, "live
debate" panel, one half of the dual-CTA) use near-black gray-900, not the brand green, to
stay legible and avoid muddying the green. Post-type identity is color-coded and fixed:
blog/quick-take = emerald, essay = gold, research/policy brief = purple — these mappings
are identity, never remapped for severity or state.

**Type:** two families, doing very distinct jobs. **Bodoni Moda** (a high-contrast modern
serif) is the *display* face — hero headlines, section titles, post headlines, drop caps,
pull-quotes, article body copy in the reading view. **Inter** is the *sans* — all UI chrome,
labels, buttons, metadata, badges. This is a hard split: body/UI text is never set in
Bodoni, and headlines are never set in Inter. Headline sizes are large and specific (not
snapped to a round scale) — 64px hero down to 21px card headline — with tight
(1.02–1.24) line-heights on display type and much more open (1.65–1.84) line-heights on
serif article body copy. Eyebrow/kicker labels are uppercase, tiny (10.5–11px), bold,
letter-spaced (0.16–0.18em).

**Spacing & layout:** roomy but not loose — cards pad 16–24px, sections pad 48–80px
vertically at desktop. Layout is a fairly conventional responsive grid (max-width ~1240px
shell, sidebar + feed on desktop, single column + bottom tab bar on mobile). No fixed/sticky
elements besides the top nav bar (sticky) and the mobile bottom nav + floating "Create" FAB.

**Backgrounds:** flat color, almost never imagery-as-background. The only gradients used
are the small post-type "stamp" thumbnails (a diagonal two-stop brand-color gradient with a
giant translucent serif letter watermark, e.g. a huge faint "R" for Research) and a very
subtle radial tint behind profile headers with no cover photo. No hand-drawn illustration,
no repeating pattern/texture, no photographic full-bleed hero — this is a text-first,
editorial product. When real cover photos exist (post covers), they're used directly with
a dark gradient overlay (`black/80 → transparent`) for text legibility, not stylized.

**Animation:** subtle and editorial, never bouncy/springy. Entrances are opacity+translateY
"rise" fades (12–28px travel, 0.4–0.6s, `cubic-bezier(0.25,0,0,1)` — an ease-out with no
overshoot), staggered slightly across sibling items (60–100ms delays). Cards lift 2px on
hover with a soft shadow increase, never scale. The one exception to "no bounce" is a small
pulsing live-indicator dot (scale 1→1.6, opacity 1→0.5, 2s loop) marking "happening now"
debates. All decorative motion respects `prefers-reduced-motion: reduce` and drops to
static/no-transition.

**Hover states:** primary buttons darken (emerald-brand → `#0E4B37`); secondary/outline
buttons get a faint canvas-tint background; text links go from muted gray to emerald;
cards lift + gain shadow; nav items get a soft canvas-colored pill background. Nothing
lightens or fades to transparent on hover.

**Press/active states:** the one explicit active-state in code is the mobile "Create" FAB,
which scales to 0.95 and rotates its plus-icon 45° into an "×". Buttons otherwise rely on
the browser default (no custom press treatment).

**Borders & shadows:** hairline borders everywhere (`#E5E7EB` default, `#F3F4F6` for
internal dividers) — borders do almost all the separation work, shadows are secondary and
very soft. Resting card shadow is nearly invisible (`shadow-sm shadow-black/[0.02]`);
hover/lift shadow is soft and diffuse (`0 8px 20px -4px rgba(0,0,0,.08)`); only true overlays
(modals, dropdown menus, the mobile create-sheet) get a real drop shadow.

**Radii:** rounded-lg (8px) for buttons/inputs, rounded-xl (12px) for the vast majority of
cards, rounded-2xl (16px) for large sheets/dual-CTA blocks/hero rail, full/pill for badges,
tags, avatars, and the FAB. Corners are consistently soft, never sharp, never excessively
round (no fully-pill buttons except the mobile FAB and rail nav pills).

**Transparency & blur:** used sparingly and specifically — `backdrop-blur` appears only on
text sitting over a photographic cover image (badges over a hero/post cover) to keep them
legible without a solid chip. Not used for card surfaces, nav bars, or modals, which are
all solid.

**Imagery color vibe:** the product ships almost no stock photography by default — user-
uploaded cover images and avatars are shown as-is with no filter/treatment. The brand's own
"imagery" is really just its gradient stamp thumbnails and logo mark. Where photography does
appear (post covers), no particular color grade is enforced.

**Cards:** white surface, 1px `#E5E7EB` border, 12px radius, near-invisible resting shadow,
2px hover lift with a soft shadow. No colored left-border accent, no colored background
tint on default cards (tinted cards are reserved for specific states — activation
progress, live debates, featured/empty states — not a general card style).
<!-- VISUAL_FOUNDATIONS -->

## Iconography

No icon font and no icon library dependency in the source repo — every icon is a hand-
written **inline SVG**, 24×24 viewBox, `stroke="currentColor"`, `strokeWidth={2}`, round
line caps/joins. Visually this matches the outline style of a set like Heroicons (simple,
geometric, two-tone-free) but nothing is imported from one — each icon is a bespoke path
written directly in the component (nav icons, search, bell, message bubble, plus/create,
chevrons). **This design system links Heroicons (outline, via CDN) as the closest faithful
match** for consumers who want a broader icon set beyond what's cataloged here — see
`guidelines/iconography.card.html` for usage. If you need an icon not shown there, keep the
same visual spec: 24×24, 2px stroke, round caps, no fill (fill is used only for a handful of
"active" nav states, matching the outline shape).

One deliberate exception: **persona-type icons** (`lib/personaIcons.tsx` — student,
researcher, educator, NGO/nonprofit, founder, policy/government, journalist/media,
professional) are custom hand-drawn outline glyphs at a slightly finer `strokeWidth={1.6}`,
purpose-built for the profile-type picker. These aren't part of a generic set and are
documented as their own small family in the iconography card.

No emoji used as icons anywhere in the UI. No unicode symbols used as icons either, with
one narrow exception: a literal checkmark character (`✓`) is used inline for verified
badges and completed-task checks — treated as typography, not iconography.

Logos: real SVG lockups were provided in `public/brand/` in the source repo and are copied
into `assets/logos/` here — full lockup (icon + wordmark), icon+wordmark without tagline,
and icon-only, each in color and white-on-dark variants. Per the source repo's own
`public/brand/README.md`, these SVGs are **auto-traced from a raster master**, not a native
vector export — treat them as good-enough path-based artwork for prototypes, but flag to
the brand owner that a true vector master (Illustrator/Figma) would be cleaner for
production use.
<!-- ICONOGRAPHY -->
