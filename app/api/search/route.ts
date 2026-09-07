import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  normalizeSearchQuery,
  runSiteSearch,
  searchOverlayPosts,
} from "@/lib/searchData";

/**
 * Search, on the server.
 *
 * The three surfaces that used to query the database from the browser now ask
 * here. Nothing a visitor can see changes: the same rows, the same filters,
 * the same limits, and no authorization to add, because everything returned is
 * already public. What changes is that the browser no longer needs a database
 * credential, which is a prerequisite for the database not being Supabase.
 *
 * Two scopes rather than two routes, because they are the same search with
 * different appetites: `overlay` is the command-palette typeahead (titles, six
 * results) and `full` is the search page (posts, people and opportunities).
 * Splitting them into separate files would duplicate the query normalisation,
 * which is the part that must not differ between them.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = normalizeSearchQuery(params.get("q"));
  const scope = params.get("scope") === "overlay" ? "overlay" : "full";

  // An empty search is an empty result, not an error. The typeahead fires this
  // on every keystroke that clears the box.
  if (!query) {
    return NextResponse.json(
      scope === "overlay"
        ? { posts: [] }
        : { posts: [], people: [], opportunities: [] }
    );
  }

  const supabase = await createClient();

  try {
    if (scope === "overlay") {
      return NextResponse.json({
        posts: await searchOverlayPosts(supabase, query),
      });
    }

    return NextResponse.json(await runSiteSearch(supabase, query));
  } catch (error) {
    // The message names the failing query and is for the server log. What the
    // reader sees is an empty result and a retry, which is what a typeahead
    // should do with a transient failure anyway.
    console.error("[api/search] failed", error);
    return NextResponse.json({ error: "Search is unavailable." }, { status: 503 });
  }
}
