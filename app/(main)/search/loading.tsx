import { Suspense } from "react";
import SearchPageSkeleton from "@/components/loading/SearchSkeleton";
import SearchLoadingContent from "./SearchLoadingContent";

export default function Loading() {
  return <Suspense fallback={<SearchPageSkeleton />}><SearchLoadingContent /></Suspense>;
}
