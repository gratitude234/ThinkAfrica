import { NextRequest, NextResponse } from "next/server";

const HIPOLABS_SEARCH_URL = "http://universities.hipolabs.com/search";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // university lists rarely change
const MAX_RESULTS = 20;

type CacheEntry = { names: string[]; expiresAt: number };

const countryCache = new Map<string, CacheEntry>();

interface HipolabsUniversity {
  name?: string;
}

async function getUniversityNames(country: string): Promise<string[]> {
  const cacheKey = country.toLowerCase();
  const cached = countryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.names;
  }

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
