import { Suspense } from "react";
import WriteCanvasSkeleton from "./WriteCanvasSkeleton";
import WriteLoadingContent from "./WriteLoadingContent";
export default function Loading() {
  return <Suspense fallback={<WriteCanvasSkeleton />}><WriteLoadingContent /></Suspense>;
}
