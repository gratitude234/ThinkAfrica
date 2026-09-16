/**
 * Says which migration file's version of a function is the one actually
 * running.
 *
 * `docs/rpc-identity-migration.md` defers several functions on exactly this
 * ground: they were redefined by more than one migration, so the file that
 * created them is not evidence of what is live, and porting one from a file
 * risks porting a superseded version. Phase 3 made the same point the
 * expensive way, when four of five migrations believed to be pending turned
 * out to be applied.
 *
 *   node scripts/migration/read-function-defs.mjs <name>       # first
 *   node scripts/migration/compare-function-defs.mjs <name>    # then this
 *
 * Compares the catalogue definition already written to out/functions against
 * every `CREATE [OR REPLACE] FUNCTION public.<name>` block in supabase/, on
 * the function *body* with whitespace collapsed. Bodies rather than whole
 * statements, because pg_get_functiondef normalises the header and a header
 * difference is not a behaviour difference.
 *
 * Reads files only. No database connection.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const outDir = join(here, "out", "functions");

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("Usage: node scripts/migration/compare-function-defs.mjs <name> [name...]");
  process.exit(2);
}

/** Everything between the first $tag$ and the matching closing one. */
function bodyOf(text) {
  const open = text.match(/\$([A-Za-z_]*)\$/);
  if (!open) return null;
  const tag = open[0];
  const start = text.indexOf(tag) + tag.length;
  const end = text.indexOf(tag, start);
  if (end < 0) return null;
  return text.slice(start, end);
}

/** Whitespace and comments are not behaviour. Comparing them reports a
 *  difference every time somebody reformats, which trains the reader to
 *  ignore this tool. */
function normalise(body) {
  return body
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, "").trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function sqlFilesUnder(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sqlFilesUnder(full));
    else if (entry.name.endsWith(".sql")) files.push(full);
  }
  return files;
}

const candidates = sqlFilesUnder(join(repo, "supabase"));

for (const name of names) {
  const liveFile = join(outDir, `public.${name}.sql`);
  let live;
  try {
    live = readFileSync(liveFile, "utf8");
  } catch {
    console.log(`\n${name}: no catalogue copy. Run read-function-defs.mjs first.`);
    continue;
  }

  const liveBody = normalise(bodyOf(live) ?? "");
  console.log(`\n${name}`);

  const pattern = new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${name}\\s*\\(`,
    "i"
  );

  let matches = 0;
  for (const file of candidates) {
    const text = readFileSync(file, "utf8");
    let index = text.search(pattern);
    while (index >= 0) {
      const chunk = text.slice(index);
      const body = bodyOf(chunk);
      if (body) {
        matches += 1;
        const same = normalise(body) === liveBody;
        console.log(
          `  ${same ? "LIVE  " : "stale "} ${file.slice(repo.length + 1).replace(/\\/g, "/")}`
        );
      }
      const next = text.slice(index + 1).search(pattern);
      index = next < 0 ? -1 : index + 1 + next;
    }
  }

  if (matches === 0) {
    console.log("  no definition found in supabase/ (defined outside the repo)");
  }
}
