"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: catches throws in the root layout itself, where no
 * other boundary is mounted. It has to render its own <html>/<body>, and it
 * cannot rely on the font variables or providers the root layout sets up,
 * so the styling here is deliberately self-contained.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: "#FAF8F5" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            fontFamily:
              "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            color: "#1A1A1A",
          }}
        >
          <div style={{ maxWidth: "28rem", textAlign: "center" }}>
            <p
              style={{
                fontSize: "1.25rem",
                fontWeight: 700,
                color: "#073929",
                margin: "0 0 1.5rem",
              }}
            >
              Indegenius
            </p>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
              Something went wrong
            </h1>
            <p
              style={{
                margin: "0.5rem 0 1.5rem",
                fontSize: "0.875rem",
                lineHeight: 1.6,
                color: "#6B6B6B",
              }}
            >
              We hit an unexpected error loading the app. Reloading usually
              clears it.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "0.625rem 1.25rem",
                backgroundColor: "#073929",
                color: "#fff",
                fontSize: "0.875rem",
                fontWeight: 500,
                border: "none",
                borderRadius: "0.5rem",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {error.digest ? (
              <p
                style={{
                  marginTop: "1.5rem",
                  fontSize: "0.6875rem",
                  color: "#9CA3AF",
                }}
              >
                Reference: {error.digest}
              </p>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
