import { assertEquals, assertMatch } from "@std/assert";
import { createApp as createApplication } from "../../app.ts";
import { MemoryUploadRepository } from "../../db/mock/memory.ts";
import { MockMemoryStorage } from "../../storage/mock/memory.ts";
import type { AppConfig } from "../../env.ts";
import type { ObjectStorage } from "../../storage/interfaces.ts";
import { MemoryObjectMetadataStore } from "../../db/mock/memory.ts";

const digest =
  "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const config: AppConfig = {
  maxUploadBytes: 1024 * 1024,
  uploadUrlTtlMs: 30 * 60 * 1000,
  staleUploadTtlMs: 30 * 60 * 1000,
  maxUploadLifetimeMs: 60 * 60 * 1000,
  duplicateRetentionMs: 60 * 60 * 1000,
  cleanupCron: "*/15 * * * *",
};

function createApp(
  objectStorage: ObjectStorage = new MockMemoryStorage(),
  objectMetadataStore = new MemoryObjectMetadataStore(),
  uploadRepository = new MemoryUploadRepository(),
  appConfig: AppConfig = config,
): ReturnType<typeof createApplication> {
  return createApplication({
    objectStorage,
    uploadRepository,
    objectMetadataStore,
    config: appConfig,
  });
}

type CreatedUpload = {
  uploadId: string;
  key: string;
  url: string;
  checksumSHA256: string;
};

async function createSingle(
  app: ReturnType<typeof createApp>,
  body = "hello",
): Promise<{ response: Response; created: CreatedUpload }> {
  const bytes = new TextEncoder().encode(body);
  const response = await app.request("/api/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      size: bytes.byteLength,
      contentType: "text/plain",
      contentDigest: await digestHex(bytes),
      strategy: "single",
    }),
  });
  return { response, created: await response.json() };
}

async function digestHex(body: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(body));
  return [...new Uint8Array(hash)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
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
    const { response, created } = await createSingle(app);
    assertEquals(response.status, 201);
    assertMatch(created.uploadId, /^[0-9a-f-]{36}$/);
    assertMatch(created.key, /^uploads\/[0-9a-f-]{36}$/);
    const putResponse = await app.request(created.url, {
      method: "PUT",
      headers: {
        "content-type": "text/plain",
        "x-amz-checksum-sha256": created.checksumSHA256,
      },
      body: "hello",
    });
    assertEquals(putResponse.status, 200);
    const completeResponse = await app.request(
      `/api/uploads/${created.uploadId}/complete`,
      { method: "POST" },
    );
    assertEquals(completeResponse.status, 200);
    assertEquals((await completeResponse.json()).status, "complete");
    assertEquals(
      await (await app.request(`/api/objects/${created.key}`)).text(),
      "hello",
    );
  },
});

Deno.test({
  name: "competing uploads are both successful and one is duplicate",
  async fn(): Promise<void> {
    const metadata = new MemoryObjectMetadataStore();
    const app = createApp(new MockMemoryStorage(), metadata);
    const first = await createSingle(app);
    const second = await createSingle(app);
    await Promise.all(
      [first.created, second.created].map((upload) =>
        app.request(upload.url, {
          method: "PUT",
          headers: { "content-type": "text/plain" },
          body: "hello",
        })
      ),
    );
    const results = await Promise.all(
      [first.created, second.created].map(async (upload) =>
        (await app.request(`/api/uploads/${upload.uploadId}/complete`, {
          method: "POST",
        })).json()
      ),
    );
    assertEquals(results.map((result) => result.status).sort(), [
      "complete",
      "duplicate",
    ]);
    const record = await metadata.findByDigest(digest);
    assertEquals(record?.completedUploadIds.length, 2);
    assertEquals(record?.duplicateStorageKeys.length, 1);
    const EXPECTED = true;
    assertEquals(
      [first.created.key, second.created.key].includes(
        record?.activeStorageKey ?? "",
      ),
      EXPECTED,
    );
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
    const upload = await response.json();
    const partResponse = await app.request(
      `/api/uploads/${upload.uploadId}/parts/1`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contentDigest:
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
        }),
      },
    );
    const part = await partResponse.json();
    const putResponse = await app.request(part.url, {
      method: "PUT",
      headers: { "x-amz-checksum-sha256": part.checksumSHA256 },
      body: "hello world",
    });
    const completeResponse = await app.request(
      `/api/uploads/${upload.uploadId}/complete`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          parts: [{ partNumber: 1, etag: putResponse.headers.get("etag") }],
        }),
      },
    );
    assertEquals(completeResponse.status, 200);
    assertEquals(
      await (await app.request(`/api/objects/${upload.key}`)).text(),
      "hello world",
    );
  },
});

Deno.test({
  name: "duplicate cleanup removes storage but retains digest metadata",
  async fn(): Promise<void> {
    const metadata = new MemoryObjectMetadataStore();
    const storage = new MockMemoryStorage();
    const app = createApp(storage, metadata);
    const first = await createSingle(app);
    const second = await createSingle(app);
    await Promise.all(
      [first.created, second.created].map((upload) =>
        app.request(upload.url, {
          method: "PUT",
          headers: { "content-type": "text/plain" },
          body: "hello",
        })
      ),
    );
    await app.request(`/api/uploads/${first.created.uploadId}/complete`, {
      method: "POST",
    });

    await app.request(`/api/uploads/${second.created.uploadId}/complete`, {
      method: "POST",
    });
    const record = await metadata.findByDigest(digest);
    assertEquals(record?.duplicateStorageKeys.length, 1);
    await app.request("/api/uploads/cleanup", { method: "POST" });
    assertEquals(
      (await app.request(`/api/objects/${second.created.key}`)).status,
      200,
    );
    // Retention is still in effect, so the duplicate is not deleted yet.
    assertEquals(
      (await metadata.findByDigest(digest))?.duplicateStorageKeys.length,
      1,
    );
  },
});

Deno.test({
  name: "cleanup removes expired incomplete upload lifecycle state",
  async fn(): Promise<void> {
    const uploads = new MemoryUploadRepository();
    const app = createApp(
      new MockMemoryStorage(),
      new MemoryObjectMetadataStore(),
      uploads,
      { ...config, staleUploadTtlMs: 0 },
    );
    const { created } = await createSingle(app);
    assertEquals(uploads.find(created.uploadId)?.status, "pending");
    await app.request("/api/uploads/cleanup", { method: "POST" });
    assertEquals(uploads.find(created.uploadId), undefined);
    assertEquals(
      (await app.request(`/api/objects/${created.key}`)).status,
      404,
    );
  },
});
