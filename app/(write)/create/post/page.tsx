import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LegacyCreatePostPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const value of values) query.append(key, value);
  }
  redirect(`/write${query.size ? `?${query.toString()}` : ""}`);
}
