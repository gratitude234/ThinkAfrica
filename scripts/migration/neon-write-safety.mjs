/**
 * Runs the Neon write-safety proof.
 *
 *   node scripts/migration/neon-write-safety.mjs
 *
 * The proof itself lives in lib/postPolicy.neon.test.ts, for the same reason
 * the parity differential does: it has to import the application's own policy
 * module, with `@/` aliases, TypeScript and a `server-only` import. A
 * standalone script would need a build step or a hand-rolled type stripper,
 * and the second is how a harness ends up testing something other than the
 * code it claims to.
 *
 * Everything it does runs inside a transaction that is always rolled back, on
 * synthetic rows created inside that transaction. Neon scratch only: the test
 * refuses a DATABASE_URL that is not a *.neon.tech host.
 */
import { spawnSync } from "node:child_process";

import { loadEnv } from "./env.mjs";

loadEnv();

const neonUrl = process.env.DATABASE_URL;

if (!neonUrl) {
  console.error(
    "\nCannot run the write-safety proof. Missing DATABASE_URL.\n\n" +
      "  DATABASE_URL\n" +
      "      the Neon SCRATCH connection string. Never point this at production.\n"
  );
  process.exit(2);
}

if (!new URL(neonUrl).hostname.endsWith(".neon.tech")) {
  console.error("\nREFUSED: DATABASE_URL does not point at Neon.\n");
  process.exit(2);
}

console.log(
  "\nProving the application refuses what the Neon trigger permits.\n" +
    "One transaction, synthetic rows, always rolled back.\n"
);

const result = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "lib/postPolicy.neon.test.ts",
    "--reporter=verbose",
  ],
  { stdio: "inherit", env: process.env }
);

process.exit(result.status ?? 1);
