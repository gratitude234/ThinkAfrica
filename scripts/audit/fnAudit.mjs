// Every database function this repo defines, and the traits that decide
// whether it survives the move to Neon unchanged.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const d = "supabase";
const ordered = [
  "schema.sql","schema_phase2.sql","schema_phase3.sql","schema_phase4.sql","schema_phase5.sql",
  ...readdirSync(d+"/migrations").filter(f=>f.endsWith(".sql")).sort().map(f=>"migrations/"+f),
  ...readdirSync(d+"/pending").filter(f=>f.endsWith(".sql")).sort().map(f=>"pending/"+f),
];
const live = new Map();
const createRe = /create\s+(?:or\s+replace\s+)?function\s+(public\.|private\.)?"?([a-z0-9_]+)"?\s*\(/gi;
for (const f of ordered) {
  const src = readFileSync(d+"/"+f,"utf8");
  const re = new RegExp(createRe.source, createRe.flags);
  let m;
  while ((m = re.exec(src))) {
    const schema = (m[1]||"public.").replace(/\.$/,"");
    const name = m[2];
    const body = src.slice(m.index, m.index + 4000);
    live.set(`${schema}.${name}`, {
      schema, name, file: f,
      securityDefiner: /security\s+definer/i.test(body),
      usesAuthUid: /auth\.uid\(\)/i.test(body),
      usesAuthRole: /auth\.role\(\)/i.test(body),
      usesAuthUsers: /auth\.users/i.test(body),
      usesPgNet: /net\.http|pg_net/i.test(body),
      usesCron: /\bcron\./i.test(body),
      usesVault: /\bvault\./i.test(body),
      usesAdvisoryLock: /advisory_(xact_)?lock/i.test(body),
      pendingOnly: f.startsWith("pending/"),
    });
  }
}
const rows=[...live.values()];
writeFileSync("scripts/audit/fn-audit.json", JSON.stringify(rows,null,1));
console.log("functions defined:", rows.length);
for (const k of ["securityDefiner","usesAuthUid","usesAuthRole","usesAuthUsers","usesPgNet","usesCron","usesVault","usesAdvisoryLock","pendingOnly"])
  console.log(`  ${k}: ${rows.filter(r=>r[k]).length}`);
console.log("private.*:", rows.filter(r=>r.schema==="private").map(r=>r.name).join(", "));
console.log("advisory-lock fns:", rows.filter(r=>r.usesAdvisoryLock).map(r=>r.name).join(", "));
console.log("pending-only fns:", rows.filter(r=>r.pendingOnly).map(r=>r.name).join(", "));
