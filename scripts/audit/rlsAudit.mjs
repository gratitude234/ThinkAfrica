// Parses every CREATE POLICY in supabase/ and classifies it. Migrations are
// cumulative, so the last file to define a (table, policy-name) pair wins.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const dir = "supabase";
const files = [
  ...readdirSync(dir + "/migrations").filter((f) => f.endsWith(".sql")).sort().map((f) => "migrations/" + f),
  "schema.sql", "schema_phase2.sql", "schema_phase3.sql", "schema_phase4.sql", "schema_phase5.sql",
];
// schema*.sql are the historical baseline; migrations are ordered by name.
const ordered = [
  "schema.sql", "schema_phase2.sql", "schema_phase3.sql", "schema_phase4.sql", "schema_phase5.sql",
  ...files.filter((f) => f.startsWith("migrations/")),
];

const live = new Map(); // key `${table}::${name}` -> record

/** A DROP TABLE takes its policies with it, so a policy defined in an earlier
 *  migration is not live just because nothing named it in a DROP POLICY. */
const droppedTables = new Set();

const POLICY_RE =
  /create\s+policy\s+(?:if\s+not\s+exists\s+)?(?:"([^"]+)"|([a-z0-9_]+))\s+on\s+(?:public\.|private\.)?"?([a-z0-9_]+)"?([\s\S]*?);/gi;
const DROP_RE = /drop\s+policy\s+(?:if\s+exists\s+)?(?:"([^"]+)"|([a-z0-9_]+))\s+on\s+(?:public\.|private\.)?"?([a-z0-9_]+)"?/gi;

/**
 * The six buckets the migration plan reasons about. Order is deliberate: a
 * policy that mentions both an admin role and auth.uid() is an admin rule, and
 * a policy that delegates to a helper function is classified by what that
 * helper decides rather than by the fact that it is a function call.
 */
function classify(body) {
  const b = body.toLowerCase();
  const has = (s) => b.includes(s);

  if (has("service_role")) return "5-provider";
  if (/role\s*=\s*'admin'|role\s+in\s*\(\s*'admin'|is_admin|admin_email|'admin'::text/.test(b))
    return "4-admin";
  // Ownership delegated to a SECURITY DEFINER helper. Still an owner rule.
  if (/is_post_owner|is_own_|owns_/.test(b)) return "2-owner";
  // Membership delegated the same way.
  if (/can_access_|can_contribute_|is_post_reviewer|is_post_coauthor|is_member/.test(b))
    return "3-membership";
  if (/exists\s*\(/.test(b) && !/auth\.uid\(\)\s*=\s*[a-z_.]+\s*\)?\s*$/.test(b))
    return "3-membership";
  if (has("auth.uid()")) return "2-owner";
  if (has("auth.role()") && has("authenticated")) return "3-membership";
  // An unconditional INSERT is an open write, not a public read, and each one
  // is a place the application will have to start doing the checking itself.
  if (/for\s+insert[\s\S]*with\s+check\s*\(\s*true\s*\)/i.test(b)) return "6-open-write";
  if (
    /using\s*\(\s*true\s*\)/.test(b) ||
    /status\s*(=|in)\s*\(?\s*'(published|selected)'/.test(b) ||
    /accepted_at\s+is\s+not\s+null/.test(b) ||
    /bucket_id\s+in\s*\(/.test(b)
  )
    return "1-public-read";
  return "0-unclassified";
}

for (const f of ordered) {
  const src = readFileSync(dir + "/" + f, "utf8");
  let m;

  // `alter publication supabase_realtime drop table public.notifications` also
  // contains "drop table" and removes nothing, so the statement must start.
  const dtre =
    /(^|;|\n)\s*drop\s+table\s+(?:if\s+exists\s+)?(?:public\.|private\.)?"?([a-z0-9_]+)"?/gi;
  while ((m = dtre.exec(src))) droppedTables.add(m[2]);

  // CREATE and DROP POLICY have to be applied in the order they appear, not in
  // two passes: several migrations drop a policy and recreate it under a new
  // name in the same file, and a drop-everything-first pass would lose the
  // recreation. `20260715000007_restrict_notification_inserts_to_admin.sql` is
  // exactly that shape.
  const combined = new RegExp(
    `(?<drop>${DROP_RE.source})|(?<create>${POLICY_RE.source})`,
    "gi"
  );
  while ((m = combined.exec(src))) {
    const statement = m[0];
    if (/^drop/i.test(statement.trim())) {
      const d = new RegExp(DROP_RE.source, "i").exec(statement);
      if (d) live.delete(`${d[3]}::${d[1] || d[2]}`);
      continue;
    }
    const c = new RegExp(POLICY_RE.source, "i").exec(statement);
    if (!c) continue;
    const name = c[1] || c[2];
    const table = c[3];
    const body = c[4] || "";
    const cmdM = body.match(/\bfor\s+(all|select|insert|update|delete)\b/i);
    live.set(`${table}::${name}`, {
      table,
      name,
      file: f,
      cmd: cmdM ? cmdM[1].toUpperCase() : "ALL",
      to:
        (body.match(/\bto\s+([a-z_, ]+?)(?=\s+(?:using|with\s+check)\b)/i) || [])[1]?.trim() ||
        "(default)",
      klass: classify(body),
      usesUid: /auth\.uid\(\)/i.test(body),
      usesRole: /auth\.role\(\)/i.test(body),
      body: body.replace(/\s+/g, " ").trim().slice(0, 240),
    });
  }
}

const removedWithTable = [...live.values()].filter((r) => droppedTables.has(r.table));
const rows = [...live.values()].filter((r) => !droppedTables.has(r.table));
writeFileSync("scripts/audit/rls-audit.json", JSON.stringify(rows, null, 1));

console.log(
  `policies on dropped tables, excluded: ${removedWithTable.length} across ` +
    `${new Set(removedWithTable.map((r) => r.table)).size} tables`
);

const byClass = {};
for (const r of rows) byClass[r.klass] = (byClass[r.klass] || 0) + 1;
console.log("policies tracked (last definition wins):", rows.length);
console.log("classification:", byClass);
const byTable = {};
for (const r of rows) (byTable[r.table] ||= []).push(r);
console.log("\ntables with policies:", Object.keys(byTable).length);
console.log("auth.uid() policies:", rows.filter(r=>r.usesUid).length, " auth.role():", rows.filter(r=>r.usesRole).length);
console.log("\n=== unclassified (need eyes) ===");
for (const r of rows.filter(r=>r.klass==="0-unclassified")) console.log(` ${r.table}.${r.name} [${r.cmd}] :: ${r.body.slice(0,120)}`);
