/**
 * Splits a pg_dump into statements, respecting dollar-quoted function bodies.
 *
 * Extracted from transform-schema.mjs so it can be tested. It is the riskiest
 * part of the pipeline by a distance: a naive split on `;` cuts every PL/pgSQL
 * body in half, and the result is not an error but a schema that applies with
 * half the logic missing. The dump's blank-line structure is not reliable
 * either, because a function body can contain blank lines.
 *
 * So the tag is tracked. `$$`, `$body$`, `$function$` and nested different
 * tags all behave the way PostgreSQL defines them: a body ends at a repeat of
 * the tag that opened it, and a different tag inside is just text.
 */

/** Every dollar-quote delimiter on one line, in order. */
const DOLLAR_TAG = /\$[A-Za-z_0-9]*\$/g;

export function splitStatements(source) {
  const statements = [];
  const lines = source.split(/\r?\n/);
  let current = [];
  let tag = null;

  for (const line of lines) {
    current.push(line);

    if (tag === null) {
      // A line can open and close a quote, or open one and leave it open. Only
      // a tag appearing an odd number of times leaves the quote open.
      const found = line.match(DOLLAR_TAG) ?? [];
      if (found.length > 0) {
        const counts = new Map();
        for (const entry of found) counts.set(entry, (counts.get(entry) ?? 0) + 1);
        for (const [entry, count] of counts) {
          if (count % 2 === 1) {
            tag = entry;
            break;
          }
        }
      }
      if (tag === null && /;\s*$/.test(line)) {
        statements.push(current.join("\n"));
        current = [];
      }
      continue;
    }

    if (line.includes(tag)) {
      tag = null;
      if (/;\s*$/.test(line)) {
        statements.push(current.join("\n"));
        current = [];
      }
    }
  }

  if (current.join("").trim()) statements.push(current.join("\n"));
  return statements;
}
