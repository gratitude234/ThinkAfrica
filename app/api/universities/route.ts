import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const HIPOLABS_SEARCH_URL = "http://universities.hipolabs.com/search";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // university lists rarely change
const MAX_RESULTS = 20;

type CacheEntry = { names: string[]; expiresAt: number };

const countryCache = new Map<string, CacheEntry>();

interface HipolabsUniversity {
  name?: string;
}

async function getUniversityNamesFromDb(country: string): Promise<string[] | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("universities")
    .select("name")
    .eq("country", country)
    .order("name");

  if (error || !data || data.length === 0) return null;
  return data.map((row) => row.name as string);
}

async function fetchAndStoreFromHipolabs(country: string): Promise<string[]> {
  const response = await fetch(
    `${HIPOLABS_SEARCH_URL}?country=${encodeURIComponent(country)}`,
    { next: { revalidate: CACHE_TTL_MS / 1000 } }
  );

  if (!response.ok) {
    throw new Error(`Hipolabs API returned ${response.status}`);
  }

  const data = (await response.json()) as HipolabsUniversity[];
  const names = Array.from(
    new Set(data.map((item) => item.name).filter((name): name is string => Boolean(name)))
  ).sort((a, b) => a.localeCompare(b));

  if (names.length > 0) {
    const supabase = createAdminClient();
    await supabase
      .from("universities")
      .upsert(
        names.map((name) => ({ country, name, verified: false })),
        { onConflict: "country,name", ignoreDuplicates: true }
      );
  }

  return names;
}

async function getUniversityNames(country: string): Promise<string[]> {
  const cacheKey = country.toLowerCase();
  const cached = countryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.names;
  }

  const dbNames = await getUniversityNamesFromDb(country);
  const names = dbNames ?? (await fetchAndStoreFromHipolabs(country));

  countryCache.set(cacheKey, { names, expiresAt: Date.now() + CACHE_TTL_MS });
  return names;
}

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get("country")?.trim();
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

  if (!country) {
    return NextResponse.json(
      { error: "Missing required 'country' parameter." },
      { status: 400 }
    );
  }

  try {
    const names = await getUniversityNames(country);
    const filtered = q ? names.filter((name) => name.toLowerCase().includes(q)) : names;

    return NextResponse.json({ universities: filtered.slice(0, MAX_RESULTS) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to fetch universities.",
      },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const country = typeof body?.country === "string" ? body.country.trim() : "";
  const name =
    typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";

  if (!country || !name) {
    return NextResponse.json(
      { error: "Both 'country' and 'name' are required." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data: existing, error: lookupError } = await supabase
    .from("universities")
    .select("name")
    .eq("country", country);

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  const match = (existing ?? []).find(
    (row) => (row.name as string).toLowerCase() === name.toLowerCase()
  );
  if (match) {
    return NextResponse.json({ name: match.name });
  }

  const { error: insertError } = await supabase
    .from("universities")
    .upsert({ country, name, verified: false }, { onConflict: "country,name", ignoreDuplicates: true });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  countryCache.delete(country.toLowerCase());

  return NextResponse.json({ name });
}
