import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ token: "token-1" as string | null }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: auth.token ? { access_token: auth.token } : null },
      }),
    },
  }),
}));

import { uploadImage } from "./uploadImage";

const file = new File(["png"], "chart.png", { type: "image/png" });

function respondWith(body: unknown) {
  const fetchMock = vi.fn(async () => ({ json: async () => body }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("uploadImage", () => {
  beforeEach(() => {
    auth.token = "token-1";
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sends the file with the session's token and returns the stored address", async () => {
    const fetchMock = respondWith({ url: "https://cdn.example/chart.png" });

    await expect(uploadImage(file)).resolves.toEqual({ ok: true, url: "https://cdn.example/chart.png" });

    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/upload-image");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer token-1" });
    expect(((init.body as FormData).get("file") as File).name).toBe("chart.png");
  });

  it("sends no token when there is no session", async () => {
    auth.token = null;
    const fetchMock = respondWith({ url: "https://cdn.example/chart.png" });

    await uploadImage(file);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toEqual({});
  });

  it("passes on the server's reason for refusing", async () => {
    respondWith({ error: "That file is not an image." });

    await expect(uploadImage(file)).resolves.toEqual({ ok: false, error: "That file is not an image." });
  });

  it("explains a refusal the server gave no reason for", async () => {
    respondWith({});

    await expect(uploadImage(file)).resolves.toEqual({
      ok: false,
      error: "Upload failed. Check the file type and size.",
    });
  });

  it("reports a failed connection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));

    await expect(uploadImage(file)).resolves.toEqual({
      ok: false,
      error: "Couldn't upload image. Check your connection and try again.",
    });
  });
});
