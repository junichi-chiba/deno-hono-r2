import { assertEquals, assertMatch } from "@std/assert";
import { Hono } from "hono";

async function createApp(): Promise<Hono> {
  const { uploadRoutes } = await import("./routes.ts");
  const { objectRoutes } = await import("../objects/routes.ts");
  return new Hono()
    .route("/api/objects", objectRoutes)
    .route("/api/uploads", uploadRoutes);
}

Deno.test({
  name: "POST /api/uploads rejects an invalid request",
  async fn(): Promise<void> {
    const response = await (await createApp()).request("/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ size: 0, contentType: "" }),
    });

    assertEquals(response.status, 400);
  },
});

Deno.test({
  name: "single upload completes through its mock signed URL",
  async fn(): Promise<void> {
    const app = await createApp();
    const response = await app.request("/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        size: 5,
        contentType: "text/plain",
        strategy: "single",
      }),
    });

    assertEquals(response.status, 201);
    const result = await response.json();
    assertMatch(result.uploadId, /^[0-9a-f-]{36}$/);
    assertEquals(result.strategy, "single");
    assertMatch(result.key, /^uploads\/[0-9a-f-]{36}$/);
    assertMatch(result.url, /^https?:\/\/.*\/api\/uploads\/mock\//);
    assertEquals(typeof result.expiresAt, "number");

    const putResponse = await app.request(result.url, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    assertEquals(putResponse.status, 200);

    const completeResponse = await app.request(
      `/api/uploads/${result.uploadId}/complete`,
      { method: "POST" },
    );
    assertEquals(completeResponse.status, 200);
    assertEquals(await completeResponse.json(), {
      uploadId: result.uploadId,
      status: "complete",
    });

    const objectResponse = await app.request(`/api/objects/${result.key}`);
    assertEquals(objectResponse.status, 200);
    assertEquals(await objectResponse.text(), "hello");
    assertEquals(objectResponse.headers.get("content-type"), "text/plain");

    await app.request(`/api/objects/${result.key}`, { method: "DELETE" });
  },
});

Deno.test({
  name: "multipart upload completes through mock part endpoints",
  async fn(): Promise<void> {
    const app = await createApp();
    const response = await app.request("/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        size: 11,
        contentType: "text/plain",
        strategy: "multipart",
      }),
    });
    assertEquals(response.status, 201);
    const upload = await response.json();

    const partResponse = await app.request(
      `/api/uploads/${upload.uploadId}/parts/1`,
      { method: "POST" },
    );
    assertEquals(partResponse.status, 200);
    const part = await partResponse.json();

    const putResponse = await app.request(part.url, {
      method: "PUT",
      body: "hello world",
    });
    assertEquals(putResponse.status, 200);
    const etag = putResponse.headers.get("etag");
    assertEquals(typeof etag, "string");

    const completeResponse = await app.request(
      `/api/uploads/${upload.uploadId}/complete`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          parts: [{ partNumber: 1, etag }],
        }),
      },
    );
    assertEquals(completeResponse.status, 200);

    const objectResponse = await app.request(`/api/objects/${upload.key}`);
    assertEquals(objectResponse.status, 200);
    assertEquals(await objectResponse.text(), "hello world");

    await app.request(`/api/objects/${upload.key}`, { method: "DELETE" });
  },
});
