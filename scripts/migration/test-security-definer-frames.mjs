/**
 * Answers one question that `docs/rpc-identity-migration.md` says has to be
 * tested rather than reasoned about:
 *
 *   When a SECURITY DEFINER function is called through a wrapper, does the
 *   extra call frame change what `current_user` reads inside the inner
 *   function?
 *
 * It matters because `guard_locked_post_write()` decides whether to enforce
 * anything by comparing `current_user` against the literal 'authenticated'.
 * That is how it tells a direct authenticated write apart from
 * `withdraw_post_submission()` acting on that member's behalf. The group 2
 * parameterisation adds exactly such a wrapper, so if a frame changed the
 * answer, withdrawing a submission would start tripping the guard it is
 * supposed to bypass.
 *
 * Run against the NEON SCRATCH database, never production: it creates and
 * drops four throwaway objects in a schema of its own. The question is about
 * PostgreSQL's semantics, not Supabase's, so the scratch database answers it.
 *
 *   node scripts/migration/test-security-definer-frames.mjs
 */
import postgres from "postgres";

import { loadEnv, requireUrl } from "./env.mjs";

loadEnv();

const neonUrl = requireUrl("DATABASE_URL");
if (!new URL(neonUrl).hostname.endsWith(".neon.tech")) {
  console.error("REFUSED: DATABASE_URL does not point at Neon.");
  process.exit(2);
}

const sql = postgres(neonUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  onnotice: () => {},
});

try {
  await sql.unsafe("drop schema if exists frame_probe cascade");
  await sql.unsafe("create schema frame_probe");

  // A distinct owner, or the test cannot discriminate. On Neon the connecting
  // role owns everything, so a probe whose functions are owned by the session
  // role reads the same name in all four positions and would report PASS
  // without having tested anything. Supabase's arrangement is the one that
  // matters -- functions owned by `postgres`, requests executed as
  // `authenticated` -- and this reproduces its shape.
  await sql.unsafe(`
    do $probe$
    begin
      if not exists (select 1 from pg_roles where rolname = 'frame_probe_owner') then
        create role frame_probe_owner nologin;
      end if;
    end
    $probe$
  `);
  await sql.unsafe("grant frame_probe_owner to current_user");
  await sql.unsafe("grant usage, create on schema frame_probe to frame_probe_owner");

  // The innermost function reports what the guard would see.
  await sql.unsafe(`
    create function frame_probe.inner_definer() returns text
    language sql security definer set search_path = ''
    as $probe$ select current_user::text $probe$
  `);

  // Two wrappers, because the two candidate shapes differ and only one of
  // them is what the migration actually writes.
  await sql.unsafe(`
    create function frame_probe.wrapper_definer() returns text
    language sql security definer set search_path = ''
    as $probe$ select frame_probe.inner_definer() $probe$
  `);

  await sql.unsafe(`
    create function frame_probe.wrapper_invoker() returns text
    language sql set search_path = ''
    as $probe$ select frame_probe.inner_definer() $probe$
  `);

  for (const name of ["inner_definer", "wrapper_definer", "wrapper_invoker"]) {
    await sql.unsafe(
      `alter function frame_probe.${name}() owner to frame_probe_owner`
    );
    await sql.unsafe(
      `grant execute on function frame_probe.${name}() to public`
    );
  }

  const [session] = await sql.unsafe(
    "select current_user::text as who, session_user::text as session"
  );
  const [direct] = await sql.unsafe("select frame_probe.inner_definer() as who");
  const [viaDefiner] = await sql.unsafe(
    "select frame_probe.wrapper_definer() as who"
  );
  const [viaInvoker] = await sql.unsafe(
    "select frame_probe.wrapper_invoker() as who"
  );

  console.log("\n  What current_user reads, per call shape:\n");
  console.log(`    at the top level                      ${session.who}`);
  console.log(`    inside a SECURITY DEFINER function    ${direct.who}`);
  console.log(`    through a SECURITY DEFINER wrapper    ${viaDefiner.who}`);
  console.log(`    through a plain wrapper               ${viaInvoker.who}`);

  const stable =
    direct.who === viaDefiner.who && direct.who === viaInvoker.who;

  // Without this the test proves nothing: if the owner and the session role
  // are the same name, every position reads the same string trivially.
  const discriminated = direct.who !== session.who;
  console.log(
    `\n  ${discriminated ? "ok  " : "VOID"}  the probe discriminates: ` +
      `SECURITY DEFINER reports the owner (${direct.who}), not the caller (${session.who}).`
  );

  console.log(
    `\n  ${stable ? "PASS" : "FAIL"}  a wrapper frame ${
      stable ? "does not change" : "CHANGES"
    } what the inner function sees.`
  );

  if (stable) {
    console.log(
      "\n  So guard_locked_post_write() reads the same value whether\n" +
        "  withdraw_post_submission() is called directly or through the\n" +
        "  parameterised overload, and its bypass behaviour is unchanged.\n" +
        "  What this does NOT establish is the value itself on Supabase,\n" +
        "  where the owner is a different role; that is unchanged by the\n" +
        "  wrapper either way, which is the whole question."
    );
  }

  process.exitCode = stable && discriminated ? 0 : 1;
} finally {
  await sql.unsafe("drop schema if exists frame_probe cascade").catch(() => {});
  await sql.unsafe("drop role if exists frame_probe_owner").catch(() => {});
  await sql.end({ timeout: 5 });
}
