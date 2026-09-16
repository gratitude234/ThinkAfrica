import { NextResponse } from "next/server";

import { bookmarksRepository } from "@/lib/db/readAdapter";
import { getCurrentUser } from "@/lib/serverAuth";
import { createClient } from "@/lib/supabase/server";

/**
 * The member's saved posts, on the server.
 *
 * The bookmarks page used to query the database from the browser, against the
 * anon key, and RLS kept one member out of another's list. That arrangement
 * has no successor: a connection string is not a public credential, so after
 * the migration there is no key a browser could hold.
 *
 * The ownership check is therefore explicit and lives here. The viewer comes
 * from the session and never from the request, because a reading list is
 * private and an id a caller can choose is an id a caller can forge.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const supabase = await createClient();

  try {
    const posts = await bookmarksRepository(supabase).list(user.id);

    return NextResponse.json({
      posts: posts.map((post) => ({
        ...post,
        co_authors: (post.post_authors ?? [])
          .filter((row) => !!row.accepted_at)
          .filter((row) => row.user_id !== post.author_id)
          .map((row) => ({ user_id: row.user_id, profile: row.profile })),
      })),
    });
  } catch (error) {
    // The message names the failing query and is for the server log. A reader
    // sees that bookmarks could not be loaded, which is not the same as being
    // told they have none.
    console.error("[api/bookmarks] failed", error);
    return NextResponse.json(
      { error: "Bookmarks are unavailable." },
      { status: 503 }
    );
  }
}
