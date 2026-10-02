# Profile V3 contract

Profile V3 turns the member page into a work-first intellectual profile without reviving product domains that the publishing reset retired.

## Product truth

- The public profile is a normal Indegenius page inside the existing application shell, not a dashboard, browser frame or separate navigation system.
- A profile answers **what has this person contributed?** before it expands into biography.
- The currently supported public work types are **Posts** and **Articles** only.
- Research, Responses, Debates, Citations, Peer Reviews and evidence labels must not appear as live profile metrics until those product domains exist again.
- Reading interests collected during onboarding shape the feed. They are shown as **Interests**, not inferred as expertise or as proof of what the member writes about.
- **Writes about** is derived only from normalized topic keys attached to the member's published Posts and Articles. It is a description of published work, not a self-declared expertise badge.
- **Related Thinkers** is an intellectual-network surface, not a generic people recommendation. A writer must first share demonstrated publishing topics with the profile owner; public follow relationships may strengthen ranking and explain the connection but cannot create a match by themselves.

## Public hierarchy

1. Compact identity header: optional short cover, photo, name, username, optional headline/bio, relationship actions and quiet follower/following counts. The cover never reserves space when absent.
2. Tabs: **Overview, Posts, Articles, About**. Owners additionally see **Drafts**.
3. If the author chose one, Overview begins with one **Selected Work** — a published Post or Article they own. This is not the retired multi-item Featured Work manager.
4. Overview then shows a truthful **Intellectual Record** made from published Posts and Articles, including a rolling 12-month activity timeline derived from real publication timestamps and a link to `/:username/record`.
5. **Writes about** is derived from the topic keys on published Posts and Articles and appears as supporting work context when enough data exists.
6. **Related Thinkers** appears only when there are directory-listed writers with demonstrated overlap in those published topics. Follow connections are secondary context, not the matching rule.
7. Overview then shows one mixed, reverse-chronological **Recent Work** stream.
8. Biography, education, location, reading interests, joined date and external work are supporting context in a desktop aside and remain fully available on About.
9. A zero-work owner gets one publishing-oriented state; a visitor gets a quiet empty state without owner actions.

## Onboarding relationship

Onboarding is Profile Stage 1, not a separate identity system.

- Required: display name and usable username.
- Optional: photo, one-line headline and short bio.
- Topics remain a separate optional reading-preference step.
- University, country, field of study and graduation year stay out of onboarding and belong in Edit Profile.
- The composer ProfileGate is only a legacy/incomplete-account safety net and must share the same essential identity rules as onboarding.

## Data and architecture

- Public profile reads go through `lib/profileViewData.ts` and the provider-neutral profile page repository. React components do not query Supabase directly.
- Direct Postgres and Supabase adapters must stay behaviorally aligned.
- Intellectual Record V3 is derived from existing published Posts + Articles. It does not restore retired profile-record tables or RPCs.
- The full record route `/:username/record` is a lightweight, paginated chronological view of the same current Posts + Articles truth. It is not the retired evidence/credibility record system.
- Derived writing topics use the existing normalized `posts.topic_keys` field. No expertise table, AI classifier or new profile topic store is introduced.
- Related Thinkers also reuses `posts.topic_keys`, the safe `profile_directory` discovery projection and public follow edges. It introduces no recommendation table and does not read bookmarks or private preferences. The Supabase and direct-Postgres implementations use the same bounded recent-match window and ranking rules.
- Related Thinkers is supplemental discovery context. If that recommendation read fails, the profile remains available and simply omits the section; stated profile facts and publication lists remain strict.
- Selected Work reuses the existing `profile_featured_posts` table but reads/writes only position 1 through the new `set_my_selected_work(uuid)` RPC. The old multi-item replacement RPCs are not used by Profile V3.

## Visual language

- Prefer open page sections, typography, whitespace and thin dividers.
- The optional profile cover is a restrained banner, not a full-screen hero and not a requirement for profile completeness.
- Avoid wrapping every section in rounded cards.
- The profile must remain readable and work-first at desktop, tablet and mobile widths.
