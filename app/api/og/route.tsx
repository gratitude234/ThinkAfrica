import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") ?? "ThinkAfrica";
  const author = searchParams.get("author") ?? "";
  const university = searchParams.get("university") ?? "";
  const type = searchParams.get("type") ?? "essay";

  const typeLabel: Record<string, string> = {
    research: "Research",
    essay: "Essay",
    policy_brief: "Policy Brief",
    blog: "Blog",
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
            {typeLabel[type] ?? "Essay"}
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
            {university ? (
              <div
                style={{
                  color: "rgba(255,255,255,0.65)",
                  fontSize: "16px",
                  fontFamily: "system-ui",
                }}
              >
                {university}
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
            ThinkAfrica
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
