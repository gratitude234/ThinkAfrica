/**
 * The optional resolved-reference relation depends on a later database column.
 * Article references work without it; enable this only after that column exists.
 */
export function isReferenceResolutionEnabled(): boolean {
  return process.env.NEXT_PUBLIC_REFERENCE_RESOLUTION_ENABLED === "1";
}