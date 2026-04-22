export async function generateCitationId(
  supabase: {
    from: (table: string) => any;
  },
  year: number
): Promise<string> {
  const { count } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true })
    .in("type", ["research", "policy_brief"])
    .not("citation_id", "is", null);
  const seq = String((count ?? 0) + 1).padStart(4, "0");
  return `TAK-${year}-${seq}`;
}
