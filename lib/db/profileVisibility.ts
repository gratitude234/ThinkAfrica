import "server-only";

/**
 * The `profiles` row-visibility rule, as SQL, for repositories that read
 * profiles over a direct connection.
 *
 * ## Why this exists
 *
 * `profiles` is not a public table. Its SELECT policy is
 *
 *     id = auth.uid()
 *     OR (suspended_at IS NULL AND can_view_profile(id, privacy_settings))
 *
 * and `can_view_profile` is
 *
 *     p_profile_id = auth.uid()
 *     OR CASE COALESCE(privacy_settings ->> 'profile_visibility', 'public')
 *          WHEN 'public'       THEN true
 *          WHEN 'members_only' THEN auth.role() = 'authenticated'
 *          ELSE false
 *        END
 *
 * PostgREST applied that to every profile read *and to every embed of a
 * profile*, which is easy to miss: a post whose author is suspended came back
 * with a null author, not with the author's name. A direct connection has no
 * RLS, so a faithful port has to carry the rule itself. Dropping it does not
 * fail loudly; it publishes the name of someone who asked not to be listed.
 *
 * ## The two translations
 *
 * `auth.uid()` becomes the viewer id the server resolved, passed as a
 * parameter. `auth.role() = 'authenticated'` becomes "there is a viewer",
 * because that is exactly what the role meant: a request carrying a valid
 * session. Neither reads any Supabase request context, so both work unchanged
 * against ordinary PostgreSQL.
 *
 * A null viewer is the logged-out reader, and gets the `public` branch only.
 */

/**
 * A boolean expression that is true for the profile rows `viewerParam` may see.
 *
 * `alias` and `viewerParam` are SQL identifiers chosen by the calling
 * repository, never by a request. The values themselves travel as bound
 * parameters, which is the whole of the injection story.
 */
export function profileVisibleSql(alias: string, viewerParam: string): string {
  return `(
    ${alias}.id = ${viewerParam}::uuid
    or (
      ${alias}.suspended_at is null
      and case coalesce(${alias}.privacy_settings ->> 'profile_visibility', 'public')
        when 'public' then true
        when 'members_only' then ${viewerParam}::uuid is not null
        else false
      end
    )
  )`;
}

/**
 * The same rule as a JOIN condition for an author embed.
 *
 * Written as a separate helper because the difference matters: as a WHERE
 * clause an invisible profile removes the *post*, and as a JOIN condition it
 * removes only the author, leaving the post with a null author. PostgREST's
 * to-one embed did the second, so an embed that used the first would silently
 * drop published posts from a feed.
 */
export function visibleAuthorJoin(
  alias: string,
  postAlias: string,
  viewerParam: string
): string {
  return `left join public.profiles ${alias}
    on ${alias}.id = ${postAlias}.author_id
   and ${profileVisibleSql(alias, viewerParam)}`;
}
