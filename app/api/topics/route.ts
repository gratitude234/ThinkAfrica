import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { loadTopicCounts, topicKeysFromCounts } from "@/lib/searchData";

/**
 * Every topic in use, with counts.
 *
 * One route for two surfaces that were each running their own version of the
 * same 500-row read from the browser: the tag field's suggestion list and the
 * search page's trending topics. They disagreed about what a topic was, one
 * keying on the normalised value and the other on the display label, which is
 * how "#africa" and "africa" ended up counted as two topics. Serving both from
 * one query means they cannot disagree again.
 *
 * `keys` are what a tag field inserts, alphabetically. `topics` are what the
 * trending list shows, most used first. Same rows, read two ways.
 *
 * Cached for a minute. The list is a rolling aggregate over the 500 most recent
 * published posts; it does not need to be fresh to the second, and a typeahead
 * that opens a dropdown should not wait on a 500-row read to do it.
 */

export const revalidate = 60;

export async function GET() {
  const supabase = await createClient();

  try {
    const topics = await loadTopicCounts(supabase);
    return NextResponse.json({ topics, keys: topicKeysFromCounts(topics) });
  } catch (error) {
    console.error("[api/topics] failed", error);
    // An empty list, not a 500. Both callers degrade to "no suggestions",
    // which is a usable tag field and a usable search page.
    return NextResponse.json({ topics: [], keys: [] }, { status: 200 });
  }
}
