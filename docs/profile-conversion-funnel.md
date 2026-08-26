# Profile conversion funnel

Last updated: 2026-08-26

## What it measures

One question: does an author's public profile turn a reader into a
relationship?

```
profile view -> work opened -> follow completed
                            \-> opportunity inquiry submitted
```

The two endings are deliberately parallel rather than sequential. A reader who
follows and a partner who sends an opportunity inquiry are both conversions,
and neither has to precede the other.

## Events

All five ride the existing activation pipeline: `trackProfileFunnelEvent` in
`lib/profileFunnel.ts` calls `trackActivationEvent`, which POSTs to
`/api/activation`, which writes one row to `activation_events`. There is no
third-party analytics dependency and no second transport.

| Event | Fires when |
| --- | --- |
| `profile_viewed` | The profile has rendered in a browser, from `ProfileViewTracker` |
| `profile_work_opened` | A reader clicks through to one of the author's entries |
| `profile_follow_completed` | The server has confirmed a new follow |
| `profile_inquiry_opened` | The opportunity inquiry modal opens on a profile |
| `profile_inquiry_submitted` | The server has accepted the inquiry |

### Properties

Every event carries `metadata`, and `activation_events.created_at` is the
timestamp. Nothing else is sent.

| Property | Values |
| --- | --- |
| `profileId` | The profile being viewed, never the viewer |
| `viewerState` | `anonymous`, `authenticated`, `owner` |
| `surface` | `profile_header`, `featured_work`, `latest_record`, `full_record`, `sticky_bar` |
| `workId` | Present on `profile_work_opened` only |
| `workKind` | `publication`, `response`, `research`, `debate` |

No display name, no email, no biography, no positioning statement, no tag
text. `lib/profileFunnel.test.ts` asserts the property set exactly, so a
future addition has to be a deliberate edit to a failing test.

## Timing rules

**Views fire from the client, after render.** `generateMetadata` would count
every crawler, and Next prefetches a profile route on link hover, so a
route-level count would include readers who never arrived. `ProfileViewTracker`
holds a ref against rerenders and Strict Mode's double effect, and
`trackActivationEvent` separately drops a repeated profile view on the same
route within ten minutes, which covers a client navigation back to a profile
already seen.

**Actions fire on completion, not on click.** `profile_follow_completed` is
raised by `onFollowCompleted`, which the relationship controls call only after
the server returns a confirmed follow. A failed write does not count, and an
anonymous reader clicking Follow is redirected to sign in rather than counted.
`profile_inquiry_submitted` fires after `submitOpportunityInquiry` returns
`ok`. Neither is in the client dedupe set: a follow is a discrete act and must
never be swallowed by a view window.

## Calculating the rates

All three read one table. Scope a window with `created_at` and read
`metadata ->> 'profileId'` as the author.

Distinct viewers per stage need `user_id`, which limits the denominators to
signed-in readers. See the limitation below.

```sql
-- Profile to work open, per author, over a window.
WITH funnel AS (
  SELECT
    metadata ->> 'profileId' AS profile_id,
    event_name,
    user_id
  FROM public.activation_events
  WHERE event_name IN (
      'profile_viewed',
      'profile_work_opened',
      'profile_follow_completed',
      'profile_inquiry_submitted'
    )
    AND created_at >= now() - interval '30 days'
)
SELECT
  profile_id,
  count(DISTINCT user_id) FILTER (WHERE event_name = 'profile_viewed')
    AS viewers,
  count(DISTINCT user_id) FILTER (WHERE event_name = 'profile_work_opened')
    AS opened_work,
  count(DISTINCT user_id) FILTER (WHERE event_name = 'profile_follow_completed')
    AS followed,
  count(DISTINCT user_id) FILTER (WHERE event_name = 'profile_inquiry_submitted')
    AS inquired
FROM funnel
GROUP BY profile_id;
```

- **Profile-to-work-open rate** = `opened_work / viewers`
- **Profile-to-follow conversion** = `followed / viewers`
- **Profile-to-inquiry conversion** = `inquired / viewers`

Exclude the author's own visits before reporting any of the three:

```sql
WHERE metadata ->> 'viewerState' <> 'owner'
```

An owner checking their own page is not a visit, and on a low-traffic profile
their visits are most of the sample.

To see which surface earns the click, group the work-open count by
`metadata ->> 'surface'`. Featured against Latest record answers whether manual
curation is doing anything for this author.

## Known limitations

**Anonymous readers are counted nowhere.** `/api/activation` accepts
`profile_viewed` and `profile_work_opened` from a signed-out browser and
returns `persisted: false` without writing a row, because `activation_events`
does not accept anonymous inserts. That boundary predates this funnel and is
deliberate. The consequence is that every rate here is a rate among signed-in
readers, and the true anonymous top of funnel is invisible. Measuring it would
mean a separate, aggregate-only counter with its own privacy review; that is
not Phase 1.

**Follows completed elsewhere are not profile conversions.** `writer_followed`
still fires for every follow anywhere in the product, and the two events are
not interchangeable. Use `profile_follow_completed` for this funnel and
`writer_followed` for follow volume overall.

**Inquiry submission was broken before this work.** The server action required
a timeline and a commitment that the profile modal never collected, so every
profile inquiry was rejected. It is fixed alongside this instrumentation, which
means `profile_inquiry_submitted` has no history to compare against and its
rate starts from zero observations rather than from a real baseline.
