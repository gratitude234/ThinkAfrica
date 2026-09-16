/**
 * Checks that no secret VALUE reached the client bundle.
 *
 *   npm run build && node scripts/migration/client-secret-scan.mjs
 *
 * The obvious scan greps the bundle for names like `BETTER_AUTH_SECRET`, and
 * that scan is wrong in both directions. It fires on Better Auth's own env
 * accessor, which contains the name as a getter key and no value at all, and
 * it would miss a secret that reached the bundle under a different name, which
 * is what actually happens when somebody adds a `NEXT_PUBLIC_` prefix to get
 * something working.
 *
 * So this reads the real values out of `.env.local` and looks for those. A
 * value in a client chunk is a leak whatever it is called.
 *
 * No value is ever printed. A finding names the variable and the chunk.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CLIENT_DIR = ".next/static";

/** Variables whose value must never appear in a client bundle. NEXT_PUBLIC_*
 *  are excluded by definition: they are meant to be there. */
function secretsFromEnv() {
  let text;
  try {
    text = readFileSync(".env.local", "utf8");
  } catch {
    console.error("No .env.local; nothing to scan for.");
    process.exit(2);
  }

  const secrets = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) continue;
    const [, name, rawValue] = match;
    if (name.startsWith("NEXT_PUBLIC_")) continue;

    const value = rawValue.trim().replace(/^["']|["']$/g, "");
    // Short values produce false positives against minified code. Anything
    // genuinely secret is far longer than this.
    if (value.length < 12) continue;
    secrets.push({ name, value });
  }
  return secrets;
}

function clientFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...clientFiles(full));
    else if (statSync(full).size > 0) out.push(full);
  }
  return out;
}

const secrets = secretsFromEnv();
const files = clientFiles(CLIENT_DIR);

if (files.length === 0) {
  console.error(`\nNo files under ${CLIENT_DIR}. Run npm run build first.\n`);
  process.exit(2);
}

console.log(
  `\nScanning ${files.length} client files for ${secrets.length} secret values.\n`
);

const findings = [];
for (const file of files) {
  const contents = readFileSync(file, "utf8");
  for (const secret of secrets) {
    if (contents.includes(secret.value)) {
      findings.push({ name: secret.name, file });
    }
  }
}

// Connection strings are a value shape rather than a named variable, so they
// are checked separately: one could arrive from somewhere other than
// .env.local.
const SHAPES = [
  ["a PostgreSQL connection string", /postgres(?:ql)?:\/\/[^\s"']*:[^\s"']*@/],
  ["a Neon host", /[\w-]+\.neon\.tech/],
];

for (const file of files) {
  const contents = readFileSync(file, "utf8");
  for (const [label, pattern] of SHAPES) {
    if (pattern.test(contents)) findings.push({ name: label, file });
  }
}

if (findings.length === 0) {
  console.log("CLIENT BUNDLE CLEAN: no secret value found.\n");
  process.exit(0);
}

console.log("LEAKED VALUES FOUND:\n");
for (const finding of findings) {
  // The name and the file. Never the value.
  console.log(`  ${finding.name} appears in ${finding.file}`);
}
console.log("");
process.exit(1);
