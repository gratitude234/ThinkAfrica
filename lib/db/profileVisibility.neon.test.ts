import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * BEHAVIOURAL PROOF that every migrated read carrying an author projection
 * reproduces the `profiles` SELECT policy, against real PostgreSQL.
 *
 * This exists because the policy was missed once. The post page, the profile
 * identity lookup and the profile record all read through the *request*
 * client, so PostgREST applied
 *
 *     id = auth.uid()
 *     OR (suspended_at IS NULL AND can_view_profile(id, privacy_settings))
 *
 * to every profile they touched, including embeds. The first PostgreSQL ports
 * joined `profiles` unconditionally, which would have published the name of a
 * suspended member and rendered a private profile to anyone who guessed the
 * username. Nothing was exposed in production, because the domains are off by
 * default, and this is what proves the fix rather than the intention.
 *
 * The fixtures are built inside a transaction and rolled back, because a
 * suspended or private member is not something production data can be relied
 * on to contain, and "no such row" is exactly the shape a broken check has.
 */

const neonUrl = process.env.DATABASE_URL;
const enabled = Boolean(neonUrl && neonUrl.includes(".neon.tech"));

const { createPostgresPostPageRepository } = await import("@/lib/db/postPage");
const { createPostgresProfileRecordRepository } = await import(
  "@/lib/db/profileRecord"
);
const { createPostgresProfilesRepository } = await import(
  "@/lib/db/postgres/profiles"
);
const { createPostgresPostsRepository } = await import("@/lib/db/postgres/posts");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

vi.setConfig({ testTimeout: 60_000 });

const STRANGER = "11111111-1111-1111-1111-111111111111";

describe.skipIf(!enabled)("the profiles policy, on every migrated read", () => {
  let sql: Awaited<ReturnType<typeof open>>;

  async function open() {
    const { default: postgres } = await import("postgres");
    return postgres(neonUrl!, {
      max: 1,
      prepare: false,
      connect_timeout: 20,
      fetch_types: false,
      onnotice: () => {},
    });
  }

  beforeAll(async () => {
    sql = await open();
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  /** Runs the body in a transaction and always rolls back. */
  async function inRollback(body: (tx: unknown) => Promise<void>) {
    await sql
      .begin(async (tx) => {
        await body(tx);
        throw new Error("rollback");
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.message !== "rollback") throw error;
      });
  }

  it("hides a private profile from the identity lookup, so the page 404s", async () => {
    await inRollback(async (tx) => {
      const executor = adaptDriver(tx as never);
      const repository = createPostgresProfilesRepository(executor);
      const username = `zz-id-${Date.now()}`;

      await executor.query(
        `insert into public.profiles (id, username, full_name, privacy_settings)
         values (gen_random_uuid(), $1::text, 'Private',
                 '{"profile_visibility": "private"}'::jsonb)`,
        [username]
      );
      const [self] = await executor.query<{ id: string }>(
        `select id::text as id from public.profiles where username = $1::text`,
        [username]
      );

      expect(await repository.findIdentityByUsername(username, null)).toBeNull();
      expect(await repository.findIdentityByUsername(username, STRANGER)).toBeNull();

      // Their own profile is always visible to them, which is the first branch
      // of the policy and the reason it is not simply a public/private flag.
      const own = await repository.findIdentityByUsername(username, self.id);
      expect(own).not.toBeNull();
    });
  });

  it("hides a suspended profile from the identity lookup", async () => {
    await inRollback(async (tx) => {
      const executor = adaptDriver(tx as never);
      const repository = createPostgresProfilesRepository(executor);
      const username = `zz-susp-${Date.now()}`;

      await executor.query(
        `insert into public.profiles (id, username, full_name, suspended_at)
         values (gen_random_uuid(), $1::text, 'Suspended', now())`,
        [username]
      );

      expect(await repository.findIdentityByUsername(username, null)).toBeNull();
    });
  });

  it("shows a members_only profile to a signed-in reader only", async () => {
    await inRollback(async (tx) => {
      const executor = adaptDriver(tx as never);
      const repository = createPostgresProfilesRepository(executor);
      const username = `zz-mem-${Date.now()}`;

      await executor.query(
        `insert into public.profiles (id, username, full_name, privacy_settings)
         values (gen_random_uuid(), $1::text, 'Members',
                 '{"profile_visibility": "members_only"}'::jsonb)`,
        [username]
      );

      expect(await repository.findIdentityByUsername(username, null)).toBeNull();
      expect(
        await repository.findIdentityByUsername(username, STRANGER)
      ).not.toBeNull();
    });
  });

  it("nulls the core post's author without dropping the post", async () => {
    await inRollback(async (tx) => {
      const executor = adaptDriver(tx as never);
      const repository = createPostgresPostsRepository(executor);

      const [post] = await executor.query<{ slug: string }>(
        `select slug from public.posts
         where status = 'published' and author_id is not null limit 1`
      );
      if (!post) return;

      await executor.query(
        `update public.profiles set suspended_at = now()
         where id = (select author_id from public.posts where slug = $1::text)`,
        [post.slug]
      );

      const record = await repository.findBySlug(post.slug, null);

      // The article survives; only the byline goes. A WHERE clause here would
      // have 404ed a published post because its author was suspended.
      expect(record).not.toBeNull();
      expect(record!.profiles).toBeNull();
    });
  });

  it("nulls a co-author on the post page without dropping the co-authorship", async () => {
    await inRollback(async (tx) => {
      const executor = adaptDriver(tx as never);
      const repository = createPostgresPostPageRepository(executor);

      const [row] = await executor.query<{ post_id: string; user_id: string }>(
        `select a.post_id::text as post_id, a.user_id::text as user_id
         from public.post_authors a
         join public.profiles p on p.id = a.user_id
         where a.accepted_at is not null
         limit 1`
      );
      if (!row) return;

      const before = await repository.collections(row.post_id, null);
      const beforeEntry = before.coAuthors.find(
        (entry) => entry.user_id === row.user_id
      );
      expect(beforeEntry).toBeDefined();

      await executor.query(
        `update public.profiles set suspended_at = now() where id = $1::uuid`,
        [row.user_id]
      );

      const after = await repository.collections(row.post_id, null);
      const afterEntry = after.coAuthors.find(
        (entry) => entry.user_id === row.user_id
      );

      // Still a co-author, with no name. The distinction matters: dropping the
      // row would change the author count and the corresponding-author flag.
      expect(afterEntry).toBeDefined();
      expect(afterEntry!.profile).toBeNull();
    });
  });

  it("nulls a co-author in the profile record's hydration", async () => {
    await inRollback(async (tx) => {
      const executor = adaptDriver(tx as never);
      const repository = createPostgresProfileRecordRepository(executor);

      const [row] = await executor.query<{ post_id: string; user_id: string }>(
        `select a.post_id::text as post_id, a.user_id::text as user_id
         from public.post_authors a
         join public.profiles p on p.id = a.user_id
         limit 1`
      );
      if (!row) return;

      await executor.query(
        `update public.profiles set privacy_settings =
           '{"profile_visibility": "private"}'::jsonb
         where id = $1::uuid`,
        [row.user_id]
      );

      const [post] = await repository.hydratePublications([row.post_id], null);
      if (!post) return;

      const entry = (post.post_authors ?? []).find(
        (author) => author.user_id === row.user_id
      );
      expect(entry).toBeDefined();
      expect(entry!.profile).toBeNull();
    });
  });

  it("keeps a public author visible, so the rule is not simply hiding everyone", async () => {
    const executor = adaptDriver(sql as never);
    const repository = createPostgresPostsRepository(executor);

    const [post] = await executor.query<{ slug: string }>(
      `select p.slug from public.posts p
       join public.profiles a on a.id = p.author_id
       where p.status = 'published'
         and a.suspended_at is null
         and coalesce(a.privacy_settings ->> 'profile_visibility', 'public') = 'public'
       limit 1`
    );
    if (!post) return;

    const record = await repository.findBySlug(post.slug, null);
    expect(record).not.toBeNull();

    // A check that refuses everything passes every hiding test. This is the
    // one that fails if the predicate is simply always false.
    expect(record!.profiles).not.toBeNull();
  });
});
