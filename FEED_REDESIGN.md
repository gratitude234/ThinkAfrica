# Feed redesign summary

This version gives Indegenius Posts, Articles, and Research three distinct feed
templates without changing the Supabase schema or publishing workflow.

## Content grammar

- **Posts are conversations.** The author and body lead, while attached photos
  use their natural aspect ratio instead of a forced landscape crop.
- **Articles are editorial stories.** The first Article in each three-Article
  run is an immersive hero. The next two keep full-width imagery but move the
  metadata, headline, and standfirst below the cover. This preserves the
  Article identity without turning a long feed into repeated green overlays.
  Articles without covers retain a strong text-led variant.
- **Research is evidence-first.** A pale plum surface, paper-shaped preview,
  honest review/citation state, manuscript metadata, and a clear View paper
  action distinguish it from social and editorial content.

## Media behavior

- Normal feed photography uses `object-contain` and the uploaded image's
  intrinsic ratio.
- Ordinary portrait photos remain portrait down to a 2:3 width/height ratio.
- Extremely tall screenshots and panoramas are constrained to keep the feed
  usable, but the full image remains visible with neutral breathing room.
- Immersive Article covers use a deliberate 16:10 mobile / 2:1 desktop crop.
  Standard Article covers use 16:9 mobile / 2:1 desktop and never collapse to
  a right-side thumbnail. That treatment is reserved for authored cover art,
  not ordinary Post media.
- Research covers use a contained 3:4 paper preview.

## Feed controls and hierarchy

- Content filters are compact, horizontally scrollable, one-tap chips on both
  mobile and desktop.
- The Subscriptions tab label is shortened to Subscribed for mobile clarity.
- Recency appears beside the author's institution by default.
- Long conversational Posts clamp to roughly four lines and expand in place
  with an accessible More/Less control.
- Editor's Pick uses the same cover-led editorial language when artwork exists
  and a spacious cream-and-gold fallback when it does not.
- Existing Like, Discuss, Share, Save, topic discovery, response context,
  evidence checks, pagination, and feed ranking behavior remain intact.

## Data-model boundary

The current product stores one `cover_image_url` per post. This redesign makes
that image display correctly and naturally. A true multi-image carousel would
require a separate media collection in the database, editor, upload flow, feed
query, and post-detail page, so it is intentionally not fabricated in the UI.
