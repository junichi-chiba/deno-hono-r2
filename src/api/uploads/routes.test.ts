import { assertEquals, assertMatch } from "@std/assert";
import { createApp as createApplication } from "../../app.ts";
import { MemoryUploadRepository } from "../../db/mock/memory.ts";
import { MockMemoryStorage } from "../../storage/mock/memory.ts";
import type { AppConfig } from "../../env.ts";
import type { ObjectStorage } from "../../storage/interfaces.ts";
import { MemoryObjectMetadataStore } from "../../db/mock/memory.ts";

function createApp(): ReturnType<typeof createApplication> {
  const objectStorage: ObjectStorage = new MockMemoryStorage();
  const config: AppConfig = {
    maxUploadBytes: 1024 * 1024,
    uploadUrlTtlMs: 30 * 60 * 1000,
    staleUploadTtlMs: 30 * 60 * 1000,
    maxUploadLifetimeMs: 60 * 60 * 1000,
  };
  return createApplication({
    objectStorage,
    uploadRepository: new MemoryUploadRepository(),
    objectMetadataStore: new MemoryObjectMetadataStore(),
    config,
  });
}

Deno.test({
  name: "POST /api/uploads rejects an invalid request",
  async fn(): Promise<void> {
    const response = await createApp().request("/api/uploads", {
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
    const app = createApp();
    const response = await app.request("/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        size: 5,
        contentType: "text/plain",
        contentDigest:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
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
    const app = createApp();
    const response = await app.request("/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        size: 11,
        contentType: "text/plain",
        contentDigest:
          "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
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
