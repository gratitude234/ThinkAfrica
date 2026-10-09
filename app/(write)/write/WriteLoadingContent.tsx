"use client";
import { useSearchParams } from "next/navigation";
import WriteCanvasSkeleton from "./WriteCanvasSkeleton";
export default function WriteLoadingContent() {
  return <WriteCanvasSkeleton variant={useSearchParams().get("editor") === "article" ? "article" : "post"} />;
}
