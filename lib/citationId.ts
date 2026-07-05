export async function generateCitationId(
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => any;
  },
  year: number
): Promise<string> {
  const { data, error } = await supabase.rpc("generate_citation_id", { p_year: year });

  if (error || typeof data !== "string") {
    throw new Error(error?.message ?? "Unable to generate citation ID.");
  }

  return data;
}
