/**
 * The config the Better Auth CLI reads for schema generation and migration.
 *
 * Deliberately separate from lib/auth/betterAuth.ts's `server-only` import,
 * which the CLI cannot load. Everything that decides the schema (the
 * additional fields, the absence of plugins) is the same in both, so what the
 * CLI creates and what the runtime expects cannot drift.
 *
 * Points at Neon scratch and refuses anything else.
 */
import { readFileSync } from "node:fs";

import { betterAuth } from "better-auth";
import { Pool } from "pg";

// Read .env.local directly rather than adding a dotenv dependency for one
// file. The CLI runs outside Next.js, which is the only thing that would
// otherwise load it.
const NEWLINES = new RegExp("\\r?\\n");
const QUOTES = new RegExp("^[\"']|[\"']$", "g");

for (const line of readFileSync(".env.local", "utf8").split(NEWLINES)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(QUOTES, "");
  }
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");
if (!new URL(url).hostname.endsWith(".neon.tech")) {
  throw new Error(
    "REFUSED: Better Auth schema generation targets Neon scratch only."
  );
}

export const auth = betterAuth({
  database: new Pool({ connectionString: url, max: 2 }),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      userMetadata: { type: "json", required: false, input: false },
      appMetadata: { type: "json", required: false, input: false },
      invitedAt: { type: "date", required: false, input: false },
      lastSignInAt: { type: "date", required: false, input: false },
    },
  },
});
