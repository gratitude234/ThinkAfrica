import { type NextRequest } from "next/server";
import { handlePostEngagement } from "@/lib/postEngagementServer";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  return handlePostEngagement(request, params, "impression");
}
