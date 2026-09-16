import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { BRAND_PROMISE, BRAND_TAGLINE } from "@/lib/brand";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") ?? BRAND_PROMISE;
  const author = searchParams.get("author") ?? "";
  const type = searchParams.get("type") ?? "brand";

  // Keyed on the kind, with the legacy vocabulary kept as aliases so an OG
  // image already cached against an old share link still resolves. An Essay, a
  // Policy Brief and a Research paper are all Articles now, and the genre
  // suffixes ("Article · Policy Brief") went with the genre.
  const kindLabel: Record<string, string> = {
    brand: BRAND_TAGLINE,
    post: "Post",
    blog: "Post",
    article: "Article",
    essay: "Article",
    policy_brief: "Article",
    research: "Article",
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#0D9164",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 72px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              background: "rgba(255,255,255,0.2)",
              borderRadius: "8px",
              padding: "6px 14px",
              color: "white",
              fontSize: "14px",
              fontFamily: "system-ui",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {kindLabel[type] ?? "Publication"}
          </div>
        </div>

        <div
          style={{
            color: "white",
            fontSize: title.length > 80 ? "42px" : "52px",
            fontWeight: 700,
            lineHeight: 1.2,
            maxWidth: "900px",
          }}
        >
          {title.length > 120 ? `${title.slice(0, 117)}…` : title}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {author ? (
              <div
                style={{
                  color: "rgba(255,255,255,0.9)",
                  fontSize: "20px",
                  fontFamily: "system-ui",
                  fontWeight: 600,
                }}
              >
                {author}
              </div>
            ) : null}
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.9)",
              fontSize: "22px",
              fontFamily: "system-ui",
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            Indegenius
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
