/**
 * Will Neon accept a logical replication subscription at all?
 *
 *   node scripts/migration/subscribe-probe.mjs
 *
 * The first attempt at this question used a conninfo with no password and got
 * back "password is required", which is PostgreSQL validating the connection
 * string rather than Neon declining the feature. That answer would have been
 * reported as "Neon refuses subscriptions", so this asks again with a
 * well-formed conninfo pointing at a host that does not exist.
 *
 * Every CREATE SUBSCRIPTION here runs inside a transaction that is rolled
 * back, with connect = false, so no slot is created on Supabase, no
 * subscription survives on Neon, and nothing connects anywhere.
 *
 * What the outcomes mean:
 *
 *   PERMITTED   the statement parsed and was authorised. Logical replication
 *               is available as a mechanism, subject to the publisher side.
 *   REFUSED     Neon declined it. The message says why.
 */
import postgres from "postgres";

import { loadEnv, requireUrl } from "./env.mjs";

loadEnv();

const neon = postgres(requireUrl("DATABASE_URL"), {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  fetch_types: false,
  onnotice: () => {},
});

// A syntactically complete conninfo. The host is reserved by RFC 2606 and
// resolves nowhere, and connect = false means it is never dialled.
const CONNINFO =
  "host=publisher.invalid port=5432 dbname=postgres user=probe password=probe";

const attempts = [
  {
    label: "CREATE SUBSCRIPTION (connect = false)",
    sql: `create subscription __probe_subscription
            connection '${CONNINFO}'
            publication __probe_publication
            with (connect = false, slot_name = NONE, create_slot = false, enabled = false)`,
  },
  {
    label: "CREATE PUBLICATION (would Neon publish?)",
    sql: `create publication __probe_publication for all tables`,
  },
];

for (const attempt of attempts) {
  try {
    await neon.begin(async (tx) => {
      await tx.unsafe(attempt.sql);
      throw new Error("__rollback__");
    });
    console.log(`  ${attempt.label.padEnd(44)} PERMITTED (unexpectedly committed)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      `  ${attempt.label.padEnd(44)} ${
        message === "__rollback__"
          ? "PERMITTED (rolled back, nothing created)"
          : `REFUSED: ${message.split("\n")[0].slice(0, 100)}`
      }`
    );
  }
}

// Confirm nothing survived.
const [subscriptions, publications] = await Promise.all([
  neon`select subname from pg_subscription where subname like '__probe%'`,
  neon`select pubname from pg_publication where pubname like '__probe%'`,
]);
console.log(
  `\n  left behind: ${subscriptions.length} subscription(s), ${publications.length} publication(s)`
);

await neon.end({ timeout: 5 });
