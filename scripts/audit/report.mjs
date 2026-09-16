/** Human-readable slices of scripts/audit/db-audit.json, for the inventory doc. */
import { readFileSync } from "node:fs";
const rows = JSON.parse(readFileSync("scripts/audit/db-audit.json", "utf8")).filter((r) => !r.isTest);
const arg = process.argv[2] ?? "summary";

const files = (set) => {
  const by = {};
  for (const r of set) (by[r.file] ||= []).push(`${r.operation} ${r.target}#${r.line}`);
  return Object.keys(by).sort().map((f) => `${f}\n    ${by[f].join(", ")}`).join("\n");
};

if (arg === "browser") console.log(files(rows.filter((r) => r.location === "browser")));
else if (arg === "service") console.log(files(rows.filter((r) => r.serviceRole)));
else if (arg === "writes") console.log(files(rows.filter((r) => ["INSERT","UPDATE","UPSERT","DELETE"].includes(r.operation))));
else if (arg === "loc") {
  for (const loc of [...new Set(rows.map((r) => r.location))].sort()) {
    const set = rows.filter((r) => r.location === loc);
    const fileCount = new Set(set.map((r) => r.file)).size;
    console.log(`${loc.padEnd(28)} sites=${String(set.length).padStart(4)} files=${String(fileCount).padStart(3)} tables=${set.filter(r=>r.kind==="table").length} rpc=${set.filter(r=>r.kind==="rpc").length} auth=${set.filter(r=>r.kind==="auth").length} storage=${set.filter(r=>r.kind==="storage").length}`);
  }
} else {
  const tbl = rows.filter((r) => r.kind === "table");
  const agg = {};
  for (const r of tbl) {
    const a = (agg[r.target] ||= { n: 0, ops: new Set(), locs: new Set(), browser: 0, service: 0 });
    a.n++; a.ops.add(r.operation); a.locs.add(r.location);
    if (r.location === "browser") a.browser++;
    if (r.serviceRole) a.service++;
  }
  for (const [t, a] of Object.entries(agg).sort((x, y) => y[1].n - x[1].n))
    console.log(`${String(a.n).padStart(3)} ${t.padEnd(34)} ${[...a.ops].sort().join("/")}${a.browser ? `  BROWSER=${a.browser}` : ""}${a.service ? `  svc=${a.service}` : ""}`);
}
