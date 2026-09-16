/**
 * Applies 20260915000001_disable_messaging_writes.sql.
 *
 *   node scripts/migration/apply-messaging-write-disablement.mjs --dry-run
 *   node scripts/migration/apply-messaging-write-disablement.mjs --apply
 *
 * The same workflow as apply-cron-removal.mjs: there is no local migration
 * runner, so the reviewed file is sent over the direct connection inside one
 * transaction with a lock timeout, and verified before that transaction ends.
 *
 * What is verified, as privileges and as behaviour:
 *
 *   - anon and authenticated can no longer execute find_or_create_conversation;
 *   - they hold no INSERT, UPDATE, DELETE or TRUNCATE on the three tables;
 *   - authenticated keeps SELECT, and service_role keeps every privilege;
 *   - acting as authenticated, a message insert and a conversation open are
 *     both refused with a permission error;
 *   - the row counts of all three tables are unchanged.
 *
 * `--dry-run` then rolls back. `--apply` commits only if every check passed.
 *
 * Output is booleans and counts only: no ids, no content, no secrets.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";

import { loadEnv, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const FILE = "20260915000001_disable_messaging_writes.sql";
const TABLES = ["conversations", "conversation_participants", "messages"];
const ROLES = ["anon", "authenticated", "service_role"];
const WRITES = ["INSERT", "UPDATE", "DELETE", "TRUNCATE"];

const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--dry-run")
    ? "dry-run"
    : null;

if (!mode) {
  console.error("\nPass --dry-run or --apply.\n");
  process.exit(2);
}

/** The file, with its own transaction boundary removed so the caller owns it. */
function statements() {
  return readFileSync(resolve("supabase/migrations", FILE), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/^\s*begin;\s*$/im, "")
    .replace(/^\s*commit;\s*$/im, "");
}

async function privileges(tx) {
  const tables = {};
  for (const table of TABLES) {
    for (const role of ROLES) {
      const [row] = await tx.unsafe(`
        select
          has_table_privilege('${role}', 'public.${table}', 'SELECT') as "SELECT",
          has_table_privilege('${role}', 'public.${table}', 'INSERT') as "INSERT",
          has_table_privilege('${role}', 'public.${table}', 'UPDATE') as "UPDATE",
          has_table_privilege('${role}', 'public.${table}', 'DELETE') as "DELETE",
          has_table_privilege('${role}', 'public.${table}', 'TRUNCATE') as "TRUNCATE"`);
      tables[`${table}:${role}`] = row;
    }
  }
  const functions = {};
  for (const role of ROLES) {
    const [row] = await tx.unsafe(`
      select has_function_privilege('${role}', 'public.find_or_create_conversation(uuid)', 'EXECUTE') as execute`);
    functions[role] = row.execute;
  }
  return { tables, functions };
}

async function counts(tx) {
  const out = {};
  for (const table of TABLES) {
    const [row] = await tx.unsafe(`select count(*)::int as n from public.${table}`);
    out[table] = row.n;
  }
  return out;
}

function printPrivileges(label, snapshot) {
  console.log(`\n${label}`);
  for (const [key, row] of Object.entries(snapshot.tables)) {
    const held = Object.entries(row)
      .filter(([, value]) => value === true)
      .map(([name]) => name);
    console.log(`  ${key.padEnd(40)} ${held.length > 0 ? held.join(",") : "(none)"}`);
  }
  for (const [role, execute] of Object.entries(snapshot.functions)) {
    console.log(`  find_or_create_conversation:${role.padEnd(14)} execute=${execute}`);
  }
}

/**
 * Runs one statement as `authenticated` inside a savepoint that is always
 * rolled back, including when the statement succeeds, so a probe can never
 * leave a row behind. Rolling back to the savepoint also undoes the role
 * switch.
 */
async function probeAsAuthenticated(tx, statement) {
  const ALLOWED = "__probe_allowed__";
  try {
    await tx.savepoint(async (sp) => {
      await sp.unsafe("set local role authenticated");
      await sp.unsafe(statement);
      throw new Error(ALLOWED);
    });
    return "allowed";
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message === ALLOWED) return "allowed";
    if (/permission denied to set role/i.test(message)) return "probe-unavailable";
    if (/permission denied/i.test(message)) return "refused: permission denied";
    return `refused: ${message.split("\n")[0].slice(0, 70)}`;
  }
}

const PROBES = {
  "insert a message": `insert into public.messages (conversation_id, sender_id, content)
    values (gen_random_uuid(), gen_random_uuid(), 'probe')`,
  "open a conversation": `select public.find_or_create_conversation(gen_random_uuid())`,
};

async function probes(tx) {
  const [membership] = await tx`
    select pg_has_role(current_user, 'authenticated', 'MEMBER') as can_act`;
  if (!membership.can_act) return null;
  const out = {};
  for (const [label, statement] of Object.entries(PROBES)) {
    out[label] = await probeAsAuthenticated(tx, statement);
  }
  return out;
}

const resolved = await resolveSupabaseUrl(postgres);
console.log(`\nConnected via ${resolved.via}`);
console.log(`Mode: ${mode}`);

const sql = postgres(resolved.url, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  fetch_types: false,
  onnotice: () => {},
});

let outcome = "unknown";
try {
  await sql
    .begin(async (tx) => {
      await tx.unsafe("set local lock_timeout = '5s'");

      const beforePrivileges = await privileges(tx);
      const beforeCounts = await counts(tx);
      const beforeProbes = await probes(tx);
      printPrivileges("Before:", beforePrivileges);
      console.log(`  probes as authenticated: ${JSON.stringify(beforeProbes)}`);

      const started = Date.now();
      await tx.unsafe(statements());
      console.log(`\n  ${mode === "apply" ? "applied" : "would apply"} ${FILE}  ${Date.now() - started}ms`);

      const afterPrivileges = await privileges(tx);
      const afterCounts = await counts(tx);
      const afterProbes = await probes(tx);
      printPrivileges("After:", afterPrivileges);
      console.log(`  probes as authenticated: ${JSON.stringify(afterProbes)}`);

      const failures = [];
      for (const table of TABLES) {
        for (const role of ["anon", "authenticated"]) {
          const row = afterPrivileges.tables[`${table}:${role}`];
          for (const write of WRITES) {
            if (row[write]) failures.push(`${role} still holds ${write} on ${table}`);
          }
        }
        if (!afterPrivileges.tables[`${table}:authenticated`].SELECT) {
          failures.push(`authenticated lost SELECT on ${table}`);
        }
        const service = afterPrivileges.tables[`${table}:service_role`];
        for (const privilege of ["SELECT", ...WRITES]) {
          if (!service[privilege]) failures.push(`service_role lost ${privilege} on ${table}`);
        }
      }
      if (afterPrivileges.functions.anon) failures.push("anon can still open a conversation");
      if (afterPrivileges.functions.authenticated) {
        failures.push("authenticated can still open a conversation");
      }
      if (!afterPrivileges.functions.service_role) {
        failures.push("service_role lost execute on find_or_create_conversation");
      }
      if (JSON.stringify(beforeCounts) !== JSON.stringify(afterCounts)) {
        failures.push("a messaging table's row count changed");
      }
      if (afterProbes) {
        for (const [label, result] of Object.entries(afterProbes)) {
          if (result !== "refused: permission denied") {
            failures.push(`as authenticated, "${label}" was ${result}`);
          }
        }
      } else {
        console.log("  note: this connection cannot act as authenticated; privilege checks only");
      }

      console.log(`  row counts unchanged: ${JSON.stringify(beforeCounts) === JSON.stringify(afterCounts)}`);

      if (failures.length > 0) {
        outcome = "failed";
        throw new Error(`verification failed: ${failures.join("; ")}`);
      }

      console.log("  verified: no client write or conversation path, reads and service role intact, rows untouched");
      if (mode === "dry-run") {
        outcome = "dry-run clean";
        throw new Error("rollback");
      }
      outcome = "applied";
    })
    .catch((error) => {
      if (error instanceof Error && error.message === "rollback") return;
      throw error;
    });

  console.log(
    outcome === "dry-run clean"
      ? "\nDry run clean. Nothing was committed.\n"
      : outcome === "applied"
        ? "\nApplied and committed.\n"
        : `\nOutcome: ${outcome}\n`
  );
} finally {
  await sql.end({ timeout: 5 });
}
