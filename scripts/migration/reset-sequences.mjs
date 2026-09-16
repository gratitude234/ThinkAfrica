/**
 * Sets every sequence on Neon past the largest value already in its column,
 * then proves no next insert can collide.
 *
 *   node scripts/migration/reset-sequences.mjs
 *
 * A `COPY` writes explicit values and never advances the sequence behind the
 * column, so a freshly loaded database is primed to hand out identifiers that
 * already exist. The failure is not immediate and not obvious: the first
 * insert after the cutover raises a unique violation, and only for the tables
 * that happen to have rows.
 *
 * `citation_sequences` gets its own treatment at the end. It is a counter
 * *table*, not a PostgreSQL sequence, so nothing here would touch it, and a
 * repeated citation id is worse than a failed insert: it is a published
 * artefact with a duplicate identifier.
 */
import postgres from "postgres";
import { loadEnv, redact, requireUrl, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const neonUrl = requireUrl("DATABASE_URL_DIRECT");
if (!new URL(neonUrl).hostname.endsWith(".neon.tech")) {
  console.error("REFUSED: DATABASE_URL_DIRECT does not point at Neon.");
  process.exit(2);
}

const neon = postgres(neonUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  connection: { statement_timeout: 120_000 },
  onnotice: () => {},
});

let failures = 0;

try {
  // Every sequence with an owning column, which covers both `serial` and
  // `GENERATED ... AS IDENTITY`. A sequence with no owner is not something
  // this can reason about and is reported rather than guessed at.
  const sequences = await neon`
    select
      seq_ns.nspname  as sequence_schema,
      seq.relname     as sequence_name,
      tab_ns.nspname  as table_schema,
      tab.relname     as table_name,
      att.attname     as column_name
    from pg_class seq
    join pg_namespace seq_ns on seq_ns.oid = seq.relnamespace
    join pg_depend dep on dep.objid = seq.oid and dep.classid = 'pg_class'::regclass
    join pg_class tab on tab.oid = dep.refobjid
    join pg_namespace tab_ns on tab_ns.oid = tab.relnamespace
    join pg_attribute att on att.attrelid = tab.oid and att.attnum = dep.refobjsubid
    where seq.relkind = 'S'
      and dep.deptype in ('a', 'i')
      and seq_ns.nspname in ('public', 'private')
    order by 1, 2`;

  console.log(`sequences with an owning column: ${sequences.length}\n`);

  for (const sequence of sequences) {
    const qualifiedSequence = `${sequence.sequence_schema}.${sequence.sequence_name}`;
    const qualifiedTable = `${sequence.table_schema}.${sequence.table_name}`;

    const [{ max }] = await neon.unsafe(
      `select coalesce(max(${sequence.column_name}), 0)::bigint as max from ${qualifiedTable}`
    );

    // is_called = true when there are rows, so nextval() returns max + 1.
    // With no rows the sequence is reset to its start and not marked called,
    // so the first nextval() returns the start value rather than skipping it.
    const hasRows = Number(max) > 0;
    await neon.unsafe(
      `select setval('${qualifiedSequence}', ${hasRows ? max : 1}, ${hasRows})`
    );

    const [{ next }] = await neon.unsafe(
      `select nextval('${qualifiedSequence}')::bigint as next`
    );
    // nextval consumed a value; put it back so the check is not itself a gap.
    await neon.unsafe(
      `select setval('${qualifiedSequence}', ${hasRows ? max : 1}, ${hasRows})`
    );

    const safe = Number(next) > Number(max);
    if (!safe) failures += 1;
    console.log(
      `  ${safe ? "ok  " : "FAIL"} ${qualifiedTable}.${sequence.column_name}` +
        `  max=${max} next=${next}`
    );
  }

  // ---- citation_sequences -------------------------------------------------
  console.log("\ncitation_sequences (a counter table, not a sequence):");
  const citation = await neon`
    select * from public.citation_sequences order by 1`;
  if (citation.length === 0) {
    console.log("  no rows: nothing has been assigned a citation id yet");
  } else {
    for (const row of citation) {
      console.log(`  ${JSON.stringify(row)}`);
    }
  }

  // The value it hands out must be past every citation id already issued.
  const [{ issued }] = await neon`
    select count(*)::int as issued from public.posts where citation_id is not null`;
  console.log(`  posts already carrying a citation id: ${issued}`);

  const { url: supabaseUrl } = await resolveSupabaseUrl(postgres);
  const supabase = postgres(supabaseUrl, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const source = await supabase`select * from public.citation_sequences order by 1`;
    const same =
      JSON.stringify(source.map((r) => ({ ...r }))) ===
      JSON.stringify(citation.map((r) => ({ ...r })));
    console.log(
      `  matches Supabase: ${same ? "yes" : "NO"}  (${source.length} row(s) on Supabase)`
    );
    if (!same) failures += 1;
  } finally {
    await supabase.end({ timeout: 5 }).catch(() => {});
  }

  console.log(
    `\n${failures === 0 ? "SEQUENCES SAFE" : `${failures} SEQUENCE CHECK(S) FAILED`}`
  );
} catch (error) {
  console.error(redact(error));
  failures += 1;
} finally {
  await neon.end({ timeout: 5 }).catch(() => {});
}

process.exit(failures === 0 ? 0 : 1);
