"use client";

import { useSearchParams } from "next/navigation";
import SearchPageSkeleton from "@/components/loading/SearchSkeleton";

export default function SearchLoadingContent() {
  const query = useSearchParams().get("q") ?? "";
  return <SearchPageSkeleton withResults={query.trim().length >= 2} />;
}
