"use client";
import { useSearchParams } from "next/navigation";
import ExploreSkeleton from "@/components/loading/ExploreSkeleton";
export default function ExploreLoadingContent() {
  const tab = useSearchParams().get("tab");
  return <ExploreSkeleton tab={tab === "trending" || tab === "topics" || tab === "people" ? tab : "for-you"} />;
}
