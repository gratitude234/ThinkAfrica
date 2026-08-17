import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(
  path.join(process.cwd(), "app/api/research-project-assets/upload/route.ts"),
  "utf8"
);
const form = fs.readFileSync(
  path.join(
    process.cwd(),
    "app/(main)/research/projects/[slug]/ProjectWorkspaceForms.tsx"
  ),
  "utf8"
);

describe("research asset upload contract", () => {
  it("keeps large file bodies out of the Vercel Function", () => {
    expect(route).toMatch(/createSignedUploadUrl/i);
    expect(route).not.toMatch(/request\.formData\(\)/i);
    expect(route).not.toMatch(/file\.arrayBuffer\(\)/i);
    expect(form).toMatch(/uploadToSignedUrl/i);
  });

  it("publishes only finalized, server-verified objects", () => {
    expect(route).toMatch(/upload_status:\s*"pending"/i);
    expect(route).toMatch(/\.info\(asset\.storage_path\)/i);
    expect(route).toMatch(/hasExpectedSignature/i);
    expect(route).toMatch(/upload_status:\s*"ready"/i);
    expect(route).toMatch(/MAX_UPLOADS_PER_HOUR/i);
    expect(route).toMatch(/upload_status", "pending"[\s\S]*created_at", staleBefore/i);
  });
});
