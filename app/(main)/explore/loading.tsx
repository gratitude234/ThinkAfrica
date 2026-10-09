import { Suspense } from "react";
import ExploreSkeleton from "@/components/loading/ExploreSkeleton";
import ExploreLoadingContent from "./ExploreLoadingContent";
export default function Loading() {
  return <Suspense fallback={<ExploreSkeleton />}><ExploreLoadingContent /></Suspense>;
}
