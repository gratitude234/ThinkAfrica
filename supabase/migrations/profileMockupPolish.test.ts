// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const author = "11111111-1111-4111-8111-111111111111";
const hidden = "22222222-2222-4222-8222-222222222222";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create table public.profiles (id uuid primary key, visible boolean not null);
    create table public.posts (id uuid primary key, author_id uuid not null, title text, excerpt text, content_kind text, status text, published_at timestamptz, created_at timestamptz, cover_image_url text, topic_keys text[]);
    alter table public.profiles enable row level security;
    alter table public.posts enable row level security;
    create policy profiles_visible on public.profiles for select using (visible or id = auth.uid());
    create policy posts_visible on public.posts for select using (status = 'published' or author_id = auth.uid());
    grant select on public.posts, public.profiles to anon, authenticated;
    insert into public.profiles values ('${author}', true), ('${hidden}', false);
    insert into public.posts
      select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, '${author}', 'Publication ' || n,
        case when n = 1 then 'Older 100% text, with "quotes"' else 'Useful text' end,
        case when n % 2 = 0 then 'article' else 'post' end, 'published',
        '2026-08-01T00:00:00Z'::timestamptz + n * interval '1 hour', '2026-08-01T00:00:00Z'::timestamptz,
        null, array['Education', ' education ', 'Youth'] from generate_series(1,63) as n;
    insert into public.posts values ('99999999-9999-4999-8999-999999999999', '${author}', 'Draft', '', 'article', 'draft', null, '2026-09-01T00:00:00Z', null, array['secret']);
    insert into public.posts values ('88888888-8888-4888-8888-888888888888', '${hidden}', 'Private profile', '', 'article', 'published', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z', null, array['private']);
  `);
  await db.exec(readFileSync(new URL("./20261002193139_profile_mockup_polish.sql", import.meta.url), "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });

async function asViewer(role: "anon" | "authenticated", id = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec(`set role ${role}`);
}

describe("profile aggregate and catalogue migration", () => {
  it("fills UTC zero months and excludes drafts", async () => {
    await asViewer("anon");
    await db.exec("set timezone = 'Pacific/Auckland'");
    const { rows } = await db.query("select * from public.profile_publication_activity($1, '2026-08-01T00:00:00Z', 3)", [author]);
    expect(rows).toEqual([{ month: "2026-08", publication_count: 63 }, { month: "2026-09", publication_count: 0 }, { month: "2026-10", publication_count: 0 }]);
  });
  it("counts a topic once per work and normalises spelling", async () => {
    await asViewer("anon");
    const { rows } = await db.query("select * from public.profile_publication_topics($1, 6)", [author]);
    expect(rows).toEqual([{ topic_key: "education", publication_count: 63 }, { topic_key: "youth", publication_count: 63 }]);
  });
  it("does not reveal a profile hidden by its RLS policy", async () => {
    await asViewer("anon");
    expect((await db.query("select * from public.profile_publication_topics($1, 6)", [hidden])).rows).toEqual([]);
    expect((await db.query<{ publication_count: number }>("select * from public.profile_publication_activity($1, '2026-08-01T00:00:00Z', 1)", [hidden])).rows[0].publication_count).toBe(0);
  });
  it("paginates past 50 and searches older work with literal punctuation", async () => {
    await asViewer("authenticated", author);
    const first = await db.query<{ id: string }>("select * from public.search_my_profile_work('', 0, 50)");
    const second = await db.query<{ id: string }>("select * from public.search_my_profile_work('', 1, 50)");
    expect(first.rows).toHaveLength(51); expect(second.rows).toHaveLength(13);
    expect(first.rows[50].id).toBe(second.rows[0].id); // look-ahead is not displayed on page 1
    const found = await db.query("select * from public.search_my_profile_work($1, 0, 50)", ['100% text, with "quotes"']);
    expect(found.rows).toHaveLength(1);
    expect((await db.query("select * from public.search_my_profile_work($1, 0, 50)", ["'),or(status.eq.draft)"])).rows).toEqual([]);
    expect((await db.query("select * from public.search_my_profile_work('Draft', 0, 50)")).rows).toEqual([]);
  });
  it("restricts catalogue reads to the authenticated owner", async () => {
    await asViewer("authenticated", hidden);
    expect((await db.query("select * from public.search_my_profile_work('', 0, 50)")).rows).toHaveLength(1);
    await asViewer("anon");
    await expect(db.query("select * from public.search_my_profile_work('', 0, 50)")).rejects.toThrow(/permission denied/);
  });
});
