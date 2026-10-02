/** Match the database's ordering before slicing a bounded page. */
export function compareProfileWork(
  left: { id: string; publishedAt: string | null; createdAt: string },
  right: { id: string; publishedAt: string | null; createdAt: string },
) {
  if (left.publishedAt === null && right.publishedAt !== null) return 1;
  if (right.publishedAt === null && left.publishedAt !== null) return -1;
  const instant = (value: string | null) =>
    value ? Date.parse(value) || 0 : 0;
  return (
    instant(right.publishedAt) - instant(left.publishedAt) ||
    instant(right.createdAt) - instant(left.createdAt) ||
    right.id.localeCompare(left.id)
  );
}
