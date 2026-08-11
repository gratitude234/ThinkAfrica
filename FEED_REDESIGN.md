# Feed redesign summary

This version gives Indegenius Posts, Articles, and Research three distinct feed
templates without changing the Supabase schema or publishing workflow.

## Content grammar

- **Posts are conversations.** The author and body lead, while attached photos
  use their natural aspect ratio instead of a forced landscape crop.
- **Articles are editorial stories.** A cover image becomes one immersive,
  tappable story object with the type, reading time, headline, and standfirst
  composed over a restrained emerald gradient. Articles without covers retain
  a strong text-led variant.
- **Research is evidence-first.** A pale plum surface, paper-shaped preview,
  honest review/citation state, manuscript metadata, and a clear View paper
  action distinguish it from social and editorial content.

## Media behavior

- Normal feed photography uses `object-contain` and the uploaded image's
  intrinsic ratio.
- Ordinary portrait photos remain portrait down to a 2:3 width/height ratio.
- Extremely tall screenshots and panoramas are constrained to keep the feed
  usable, but the full image remains visible with neutral breathing room.
- Article covers keep a deliberate editorial 4:3 mobile / 16:10 desktop crop.
  That treatment is reserved for authored cover art, not ordinary Post media.
- Research covers use a contained 3:4 paper preview.

## Feed controls and hierarchy

- Content filters are compact, horizontally scrollable, one-tap chips on both
  mobile and desktop.
- The Subscriptions tab label is shortened to Subscribed for mobile clarity.
- Recency appears beside the author's institution by default.
- Existing Like, Discuss, Share, Save, topic discovery, response context,
  evidence checks, pagination, and feed ranking behavior remain intact.

## Data-model boundary

The current product stores one `cover_image_url` per post. This redesign makes
that image display correctly and naturally. A true multi-image carousel would
require a separate media collection in the database, editor, upload flow, feed
query, and post-detail page, so it is intentionally not fabricated in the UI.
