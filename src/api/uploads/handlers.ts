import type { Context } from "hono";
import type { AppConfig } from "../../env.ts";
import type { ObjectStorage } from "../../storage/interfaces.ts";
import type { UploadRepository } from "../../db/upload-repository.ts";
import type { ObjectMetadataStore } from "../../domain/ports.ts";
import { saveCompletedContent } from "../../domain/content.ts";
import { sha256HexToBase64 } from "../../domain/object.ts";
import { CompleteUploadSchema, CreatePartUploadSchema } from "./schema.ts";
import type { UploadPart } from "./schema.ts";

type UploadStrategy = "auto" | "single" | "multipart";

export type UploadDependencies = {
  objectStorage: ObjectStorage;
  uploadRepository: UploadRepository;
  objectMetadataStore: ObjectMetadataStore;
  config: AppConfig;
};

export type UploadHandlers = {
  cleanupExpiredUploads: () => Promise<void>;
  handleCreateUpload: (c: Context) => Promise<Response>;
  handleCleanup: (c: Context) => Promise<Response>;
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
  const {
    objectStorage: storage,
    uploadRepository: uploads,
    config,
    objectMetadataStore,
  } = deps;

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
    const now = Date.now();
    const retentionMs = config.duplicateRetentionMs ?? 24 * 60 * 60 * 1000;
    const duplicates = (await objectMetadataStore.list()).filter(
      (metadata) =>
        metadata.status === "duplicate" &&
        metadata.updatedAt + retentionMs <= now,
    );
    await Promise.all(
      duplicates.map(async (duplicate) => {
        await storage.deleteObject(duplicate.key);
        await objectMetadataStore.save({
          ...duplicate,
          status: "deleted",
          updatedAt: now,
        });
      }),
    );
  }

  async function handleCleanup(c: Context): Promise<Response> {
    if (!storage.isMock) return c.notFound();
    await cleanupExpiredUploads();
    return c.json({ status: "cleanup complete" });
  }

  async function handleCreateUpload(c: Context): Promise<Response> {
    await cleanupExpiredUploads();
    const {
      size,
      contentType,
      contentDigest,
      force = false,
      strategy: requestedStrategy,
    } = await c.req
      .json<{
        size: number;
        contentType: string;
        contentDigest: string;
        force?: boolean;
        strategy?: UploadStrategy;
      }>();
    const strategy = requestedStrategy === "single" ? "single" : "multipart";
    const normalizedDigest = contentDigest.toLowerCase();
    const canForce = force && storage.isMock;
    const existing = await objectMetadataStore.findByDigest(normalizedDigest);
    if (existing && !canForce) {
      return c.json({
        error: "Object with this content digest already exists",
        key: existing.key,
      }, 409);
    }
    const pending = uploads.findPendingByDigest(normalizedDigest);
    if (pending && !canForce) {
      const retryCount = pending.retryCount + 1;
      uploads.update(pending.id, { retryCount });
      const exhausted = retryCount > config.dedupMaxRetries;
      const response = {
        error: exhausted
          ? "An upload with this content digest is still in progress; retry limit reached"
          : "An upload with this content digest is already in progress",
        uploadId: pending.id,
        retryCount,
        maxRetries: config.dedupMaxRetries,
        ...(exhausted
          ? {}
          : { retryAfterSeconds: config.dedupRetryAfterSeconds }),
      };
      return c.json(
        response,
        409,
        exhausted
          ? undefined
          : { "Retry-After": String(config.dedupRetryAfterSeconds) },
      );
    }
    if (pending && canForce) {
      await expireUpload(pending);
    }
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
        expectedContentDigest: normalizedDigest,
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
          checksumSHA256: sha256HexToBase64(upload.expectedContentDigest),
          expiresInSeconds: Math.floor(config.uploadUrlTtlMs / 1000),
        });

      return c.json({
        uploadId: upload.id,
        key: upload.key,
        strategy: upload.strategy,
        url,
        checksumSHA256: sha256HexToBase64(upload.expectedContentDigest),
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
      expectedContentDigest: normalizedDigest,
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
      checksumSHA256: sha256HexToBase64(upload.expectedContentDigest),
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

    let checksumSHA256: string | undefined;
    try {
      const input = CreatePartUploadSchema.safeParse(await c.req.json());
      if (!input.success) {
        return c.json({ error: "Invalid part checksum" }, 400);
      }
      const contentDigest = input.data.contentDigest?.toLowerCase();
      if (contentDigest && input.data.checksumSHA256) {
        const encodedDigest = sha256HexToBase64(contentDigest);
        if (encodedDigest !== input.data.checksumSHA256) {
          return c.json({ error: "Invalid part checksum" }, 400);
        }
      }
      checksumSHA256 = input.data.checksumSHA256 ??
        (contentDigest ? sha256HexToBase64(contentDigest) : undefined);
    } catch {
      if (!storage.isMock) {
        return c.json({ error: "Multipart part checksum is required" }, 400);
      }
    }
    if (!storage.isMock && !checksumSHA256) {
      return c.json({ error: "Multipart part checksum is required" }, 400);
    }
    const url = storage.isMock
      ? mockUploadUrl(c, `${upload.id}/parts/${partNumber}`)
      : await storage.createSignedPartUploadUrl({
        key: upload.key,
        uploadId: upload.multipartUploadId,
        partNumber,
        checksumSHA256,
        expiresInSeconds: Math.floor(config.uploadUrlTtlMs / 1000),
      });
    const expiresAt = Math.min(
      upload.expiresAt,
      Date.now() + config.uploadUrlTtlMs,
    );
    uploads.update(upload.id, {
      expiresAt,
      lastActivityAt: Date.now() + config.staleUploadTtlMs,
      ...(checksumSHA256
        ? {
          partChecksums: {
            ...upload.partChecksums,
            [String(partNumber)]: checksumSHA256,
          },
        }
        : {}),
    });

    return c.json({
      uploadId: upload.id,
      multipartUploadId: upload.multipartUploadId,
      key: upload.key,
      partNumber,
      url,
      expiresAt,
      ...(checksumSHA256 ? { checksumSHA256 } : {}),
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
      parts = parts.map((part) => ({
        ...part,
        ...(upload.partChecksums[String(part.partNumber)]
          ? {
            checksumSHA256: upload.partChecksums[String(part.partNumber)],
          }
          : {}),
      }));
      await storage.completeMultipartUpload(
        upload.key,
        upload.multipartUploadId,
        parts,
        sha256HexToBase64(upload.expectedContentDigest),
      );
      uploads.update(upload.id, { parts });
    }

    const object = await storage.headObject(upload.key);
    if (!object) {
      uploads.update(upload.id, { status: "failed" });
      return c.json({ error: "Uploaded object does not exist" }, 422);
    }
    const expectedChecksum = sha256HexToBase64(upload.expectedContentDigest);
    if (
      object.ContentLength !== upload.expectedSize ||
      object.ContentType !== upload.expectedContentType ||
      object.ChecksumSHA256 !== expectedChecksum
    ) {
      await storage.deleteObject(upload.key);
      uploads.update(upload.id, { status: "failed" });
      return c.json({ error: "Uploaded object does not match metadata" }, 422);
    }

    const actualDigest = upload.expectedContentDigest;
    const now = Date.now();
    const completed = await saveCompletedContent(objectMetadataStore, {
      key: upload.key,
      size: object.ContentLength,
      contentType: object.ContentType ?? upload.expectedContentType,
      contentDigest: actualDigest,
      etag: object.ETag ?? `"${actualDigest}"`,
      createdAt: upload.createdAt,
      updatedAt: now,
    });
    const status = completed.status === "duplicate" ? "duplicate" : "complete";
    uploads.update(upload.id, {
      status,
      ...(completed.duplicateOf ? { duplicateOf: completed.duplicateOf } : {}),
      verifiedAt: now,
    });
    return c.json({
      uploadId: upload.id,
      status,
      ...(completed.duplicateOf ? { duplicateOf: completed.duplicateOf } : {}),
    });
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
    const checksumSHA256 = c.req.header("x-amz-checksum-sha256");
    if (
      checksumSHA256 &&
      checksumSHA256 !== sha256HexToBase64(upload.expectedContentDigest)
    ) {
      return c.json({ error: "Checksum does not match upload metadata" }, 400);
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
    const checksumSHA256 = c.req.header("x-amz-checksum-sha256");
    const expectedPartChecksum = upload.partChecksums[String(partNumber)];
    if (checksumSHA256 && checksumSHA256 !== expectedPartChecksum) {
      return c.json({ error: "Checksum does not match upload metadata" }, 400);
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
    handleCleanup,
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
