import type { Context } from "hono";
import type { AppConfig } from "../../env.ts";
import type { ObjectStorage } from "../../storage/ports.ts";
import type { UploadRepository } from "../../db/upload-repository.ts";
import { CompleteUploadSchema } from "./schema.ts";

type UploadStrategy = "auto" | "single" | "multipart";
type UploadPart = { partNumber: number; etag: string };

export type UploadDependencies = {
  objectStorage: ObjectStorage;
  uploadRepository: UploadRepository;
  config: AppConfig;
};

export type UploadHandlers = {
  cleanupExpiredUploads: () => Promise<void>;
  handleCreateUpload: (c: Context) => Promise<Response>;
  handleCreatePartUpload: (c: Context) => Promise<Response>;
  handleCompleteUpload: (c: Context) => Promise<Response>;
  handleAbortUpload: (c: Context) => Promise<Response>;
  handleExtendVerification: (c: Context) => Promise<Response>;
  handleMockSinglePut: (c: Context) => Promise<Response>;
  handleMockPartPut: (c: Context) => Promise<Response>;
};

function mockUploadUrl(c: Context, suffix: string): string {
  const requestUrl = new URL(c.req.url);
  const uploadId = c.req.param("uploadId");
  const marker = uploadId ? `/${uploadId}` : "";
  const markerIndex = marker ? requestUrl.pathname.indexOf(marker) : -1;
  const basePath = markerIndex >= 0
    ? requestUrl.pathname.slice(0, markerIndex)
    : requestUrl.pathname.replace(/\/$/, "");
  return new URL(`${basePath}/mock/${suffix}`, requestUrl).toString();
}

export function createUploadHandlers(
  deps: UploadDependencies,
): UploadHandlers {
  const { objectStorage: storage, uploadRepository: uploads, config } = deps;

  async function deleteOrAbortUpload(upload: {
    key: string;
    strategy: "single" | "multipart";
    multipartUploadId?: string;
  }): Promise<void> {
    if (upload.strategy === "multipart" && upload.multipartUploadId) {
      await storage.abortMultipartUpload(upload.key, upload.multipartUploadId);
    } else {
      await storage.deleteObject(upload.key);
    }
  }

  async function expireUpload(upload: {
    id: string;
    key: string;
    strategy: "single" | "multipart";
    multipartUploadId?: string;
  }): Promise<void> {
    await deleteOrAbortUpload(upload);
    uploads.update(upload.id, { status: "expired" });
  }

  async function cleanupExpiredUploads(): Promise<void> {
    await Promise.all(
      uploads.findExpired().map(async (expired) => await expireUpload(expired)),
    );
  }

  async function handleCreateUpload(c: Context): Promise<Response> {
    await cleanupExpiredUploads();
    const { size, contentType, strategy: requestedStrategy } = await c.req
      .json<{
        size: number;
        contentType: string;
        strategy?: UploadStrategy;
      }>();
    const strategy = requestedStrategy === "single" ? "single" : "multipart";
    const id = crypto.randomUUID();
    const key = `uploads/${id}`;
    const now = Date.now();
    const expiresAt = now + config.uploadUrlTtlMs;

    if (strategy === "single") {
      const upload = uploads.save({
        id,
        key,
        expectedSize: size,
        expectedContentType: contentType,
        createdAt: now,
        expiresAt,
        lastActivityAt: now + config.staleUploadTtlMs,
        strategy,
        parts: [],
        status: "pending",
      });
      const url = storage.isMock
        ? mockUploadUrl(c, upload.id)
        : await storage.createSignedUploadUrl({
          key: upload.key,
          contentType: upload.expectedContentType,
          expiresInSeconds: Math.floor(config.uploadUrlTtlMs / 1000),
        });

      return c.json({
        uploadId: upload.id,
        key: upload.key,
        strategy: upload.strategy,
        url,
        expiresAt: upload.expiresAt,
      }, 201);
    }

    const multipartUploadId = await storage.createMultipartUpload(
      key,
      contentType,
    );
    const upload = uploads.save({
      id,
      key,
      expectedSize: size,
      expectedContentType: contentType,
      createdAt: now,
      expiresAt,
      lastActivityAt: now + config.staleUploadTtlMs,
      strategy,
      multipartUploadId,
      parts: [],
      status: "pending",
    });

    return c.json({
      uploadId: upload.id,
      multipartUploadId: upload.multipartUploadId,
      key: upload.key,
      strategy: upload.strategy,
      expiresAt: upload.expiresAt,
    }, 201);
  }

  async function handleCreatePartUpload(c: Context): Promise<Response> {
    const uploadId = c.req.param("uploadId");
    const partNumber = Number(c.req.param("partNumber"));
    if (!uploadId || !Number.isSafeInteger(partNumber)) {
      return c.json({ error: "Upload not found" }, 404);
    }

    const upload = uploads.find(uploadId);
    if (
      !upload ||
      upload.status !== "pending" ||
      upload.strategy !== "multipart" ||
      !upload.multipartUploadId
    ) {
      return c.json({ error: "Upload not found" }, 404);
    }
    if (upload.expiresAt <= Date.now()) {
      await expireUpload(upload);
      return c.json({ error: "Upload expired" }, 410);
    }

    const url = storage.isMock
      ? mockUploadUrl(c, `${upload.id}/parts/${partNumber}`)
      : await storage.createSignedPartUploadUrl({
        key: upload.key,
        uploadId: upload.multipartUploadId,
        partNumber,
        expiresInSeconds: Math.floor(config.uploadUrlTtlMs / 1000),
      });
    const expiresAt = Math.min(
      upload.expiresAt,
      Date.now() + config.uploadUrlTtlMs,
    );
    uploads.update(upload.id, {
      expiresAt,
      lastActivityAt: Date.now() + config.staleUploadTtlMs,
    });

    return c.json({
      uploadId: upload.id,
      multipartUploadId: upload.multipartUploadId,
      key: upload.key,
      partNumber,
      url,
      expiresAt,
    });
  }

  async function handleCompleteUpload(c: Context): Promise<Response> {
    const uploadId = c.req.param("uploadId");
    if (!uploadId) return c.json({ error: "Upload not found" }, 404);
    const upload = uploads.find(uploadId);
    if (!upload || upload.status !== "pending") {
      return c.json({ error: "Upload not found" }, 404);
    }
    if (upload.expiresAt <= Date.now()) {
      await expireUpload(upload);
      return c.json({ error: "Upload expired" }, 410);
    }

    if (upload.strategy === "multipart") {
      if (!upload.multipartUploadId) {
        return c.json({ error: "Multipart upload is not initialized" }, 409);
      }
      let parts: UploadPart[];
      try {
        const result = CompleteUploadSchema.safeParse(await c.req.json());
        if (!result.success) {
          return c.json({ error: "Invalid multipart parts" }, 400);
        }
        parts = result.data.parts;
      } catch {
        return c.json({ error: "Multipart parts are required" }, 400);
      }
      const partNumbers = new Set<number>();
      for (const part of parts) {
        if (partNumbers.has(part.partNumber)) {
          return c.json({ error: "Invalid multipart parts" }, 400);
        }
        partNumbers.add(part.partNumber);
      }
      parts = [...parts].sort((a, b) => a.partNumber - b.partNumber);
      await storage.completeMultipartUpload(
        upload.key,
        upload.multipartUploadId,
        parts,
      );
      uploads.update(upload.id, { parts });
    }

    const object = await storage.headObject(upload.key);
    if (!object) {
      uploads.update(upload.id, { status: "failed" });
      return c.json({ error: "Uploaded object does not exist" }, 422);
    }
    if (
      object.ContentLength !== upload.expectedSize ||
      object.ContentType !== upload.expectedContentType
    ) {
      await storage.deleteObject(upload.key);
      uploads.update(upload.id, { status: "failed" });
      return c.json({ error: "Uploaded object does not match metadata" }, 422);
    }

    uploads.update(upload.id, { status: "complete", verifiedAt: Date.now() });
    return c.json({ uploadId: upload.id, status: "complete" });
  }

  async function handleAbortUpload(c: Context): Promise<Response> {
    const uploadId = c.req.param("uploadId");
    if (!uploadId) return c.json({ error: "Upload not found" }, 404);
    const upload = uploads.find(uploadId);
    if (!upload || upload.status !== "pending") {
      return c.json({ error: "Upload not found" }, 404);
    }

    await deleteOrAbortUpload(upload);
    uploads.update(upload.id, { status: "aborted" });
    return c.json({ uploadId: upload.id, status: "aborted" });
  }

  async function handleExtendVerification(c: Context): Promise<Response> {
    const uploadId = c.req.param("uploadId");
    if (!uploadId) return c.json({ error: "Upload not found" }, 404);
    const upload = uploads.find(uploadId);
    if (!upload || upload.status !== "pending") {
      return c.json({ error: "Upload not found" }, 404);
    }

    const now = Date.now();
    if (upload.expiresAt <= now) {
      await expireUpload(upload);
      return c.json({ error: "Upload expired" }, 410);
    }

    const expiresAt = Math.min(
      upload.expiresAt + config.uploadUrlTtlMs,
      upload.createdAt + config.maxUploadLifetimeMs,
    );
    uploads.update(upload.id, {
      expiresAt,
      lastActivityAt: now + config.staleUploadTtlMs,
    });

    return c.json({ uploadId: upload.id, expiresAt });
  }

  function isMockUploadRequest(c: Context): boolean {
    return storage.isMock && c.req.param("uploadId") !== undefined;
  }

  async function handleMockSinglePut(c: Context): Promise<Response> {
    const uploadId = c.req.param("uploadId");
    if (!isMockUploadRequest(c) || !uploadId) return c.notFound();
    const upload = uploads.find(uploadId);
    if (
      !upload || upload.status !== "pending" || upload.strategy !== "single"
    ) {
      return c.json({ error: "Upload not found" }, 404);
    }
    if (upload.expiresAt <= Date.now()) {
      await expireUpload(upload);
      return c.json({ error: "Upload expired" }, 410);
    }

    const contentType = c.req.header("content-type");
    if (contentType && contentType !== upload.expectedContentType) {
      return c.json(
        { error: "Content type does not match upload metadata" },
        415,
      );
    }
    const body = new Uint8Array(await c.req.raw.arrayBuffer());
    if (body.byteLength > config.maxUploadBytes) {
      return c.json({ error: "Upload exceeds the configured size limit" }, 413);
    }
    const etag = await storage.putObject(
      upload.key,
      body,
      upload.expectedContentType,
    );
    uploads.update(upload.id, {
      lastActivityAt: Date.now() + config.staleUploadTtlMs,
    });
    return new Response(null, { status: 200, headers: { etag } });
  }

  async function handleMockPartPut(c: Context): Promise<Response> {
    const uploadId = c.req.param("uploadId");
    if (!isMockUploadRequest(c) || !uploadId) return c.notFound();
    const partNumber = Number(c.req.param("partNumber"));
    const upload = uploads.find(uploadId);
    if (
      !upload ||
      upload.status !== "pending" ||
      upload.strategy !== "multipart" ||
      !upload.multipartUploadId
    ) {
      return c.json({ error: "Upload not found" }, 404);
    }
    if (upload.expiresAt <= Date.now()) {
      await expireUpload(upload);
      return c.json({ error: "Upload expired" }, 410);
    }
    const body = new Uint8Array(await c.req.raw.arrayBuffer());
    if (body.byteLength > config.maxUploadBytes) {
      return c.json({ error: "Upload exceeds the configured size limit" }, 413);
    }

    const etag = await storage.uploadPart(
      upload.key,
      upload.multipartUploadId,
      partNumber,
      body,
    );
    uploads.update(upload.id, {
      lastActivityAt: Date.now() + config.staleUploadTtlMs,
    });
    return new Response(null, { status: 200, headers: { etag } });
  }

  return {
    cleanupExpiredUploads,
    handleCreateUpload,
    handleCreatePartUpload,
    handleCompleteUpload,
    handleAbortUpload,
    handleExtendVerification,
    handleMockSinglePut,
    handleMockPartPut,
  };
}

export function cleanupExpiredUploads(
  deps: UploadDependencies,
): Promise<void> {
  return createUploadHandlers(deps).cleanupExpiredUploads();
}
