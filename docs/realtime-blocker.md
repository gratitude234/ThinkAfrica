# The Supabase Realtime dependency

Supabase Realtime has no successor in the target stack. This records what
depends on it, what the options are, and why none of them was implemented in
Phase 3.

**Nothing here is a decision.** It is the material for one.

---

## 1. What actually uses it

Three client components open a `postgres_changes` subscription. All three are
gated by `shouldUseRealtime()`, which reads `NEXT_PUBLIC_ENABLE_REALTIME`.

| Component | Subscribes to | What it does |
|---|---|---|
| [MessageThread.tsx](<../app/(main)/messages/[id]/MessageThread.tsx>) | `messages` INSERT, `conversation_participants` UPDATE, filtered by `conversation_id` | Appends an incoming message; reflects the other participant's read receipt |
| [PostsTable.tsx](<../app/(main)/dashboard/PostsTable.tsx>) | `posts` UPDATE and DELETE, filtered by `author_id` | Keeps the dashboard's status column current while an editor moves a submission |
| [NotificationBell.tsx](../components/ui/NotificationBell.tsx) | `notifications` | Unread count |

Two further reads sit alongside the messaging subscription and move with it
rather than separately: `messages` and `conversation_participants` in
`MessageThread`, and `conversation_participants` in
[MessagesUnreadBadge.tsx](../components/ui/MessagesUnreadBadge.tsx). They are
classified "realtime-specific" in
[database-access-inventory.md](database-access-inventory.md) §3 for that
reason.

## 2. Why it is already half-disabled

`20260521000001_disable_realtime_for_launch_stability.sql` removed
`notifications`, `debate_arguments` and `webinar_questions` from the
`supabase_realtime` publication. Phase 3 confirmed against the live database
that the `realtime` schema exists with 9 tables and 224 kB, and that the
application's own tables are not in the publication.

So the feature is already off in production, and the flag is the gate. That is
worth stating plainly: **this is not load-bearing today.** It is a capability
the product may want back, not one it is currently relying on.

## 3. Why it cannot be carried across

Realtime is a Supabase service, not a PostgreSQL feature. It reads the
write-ahead log through a logical replication slot, filters by RLS, and pushes
over WebSocket. Neon offers logical replication, but there is no equivalent
service, and Cloudflare Workers have no long-lived process to hold a
subscription open on the server side.

Every replacement therefore changes the architecture rather than swapping a
library.

## 4. The options, with their real costs

| Option | How it works | Cost | Where it fits |
|---|---|---|---|
| **Do nothing** | Leave the flag off. The features degrade to what they already are: a message thread that updates on navigation, a dashboard that updates on refresh | Zero. Also zero benefit | The honest default, and what Phase 3 leaves in place |
| **Polling** | The three components poll a route handler on an interval | Simple, works everywhere, no new infrastructure. Costs a request per client per interval, which is the thing the fan-out work has been reducing | Fastest path back to parity for the dashboard, where a 30-second delay is invisible |
| **Cloudflare Durable Objects** | One object per conversation holds the WebSocket connections; the server action that writes a message also notifies it | Native to the target stack, no polling, exact delivery. Needs a Durable Object per conversation and a migration of the client from `postgres_changes` to a plain WebSocket | The right answer for messaging specifically |
| **Neon logical replication into a fan-out service** | Replicate the WAL to something that pushes | Closest to what Supabase does, and the most infrastructure to own. Also reintroduces a component whose failure is invisible until someone notices messages stopped arriving | Hard to justify for three components |
| **A third-party service** | Pusher, Ably, or similar | Fastest to build, adds a vendor and a bill | Worth pricing before building Durable Objects |

## 5. What Phase 3 recommends, and does not do

Split the problem rather than solving it once. The three subscriptions have
different requirements and only one of them is interesting:

- **Notifications and the dashboard** want eventual consistency measured in
  tens of seconds. Polling a route handler is sufficient and needs nothing new.
- **Messaging** wants immediacy, and is the only case where a person is waiting
  for the other side of a conversation. Durable Objects fit it exactly, and the
  server action that already writes the message
  ([messages/[id]/actions.ts](<../app/(main)/messages/[id]/actions.ts>), Phase 2)
  is the natural place to notify from.

The prerequisite for either is the same and is not done: the messaging reads
listed in §1 still run in the browser. They move server-side first, and the
subscription question comes after, because a component that no longer holds a
database client is a component whose realtime strategy can change without
touching its data access.

**Do not solve this by accident.** Moving the messaging browser reads
server-side is a Phase 4 task with an obvious shape; choosing a realtime
architecture is a separate decision with a budget attached.
