import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
} from "s3";
import { getSignedUrl } from "presigner";
import type { Context } from "hono";
import {
  maxUploadBytes,
  maxUploadLifetimeMs,
  staleUploadTtlMs,
  uploadUrlTtlMs,
} from "../../env.ts";
import {
  findExpiredUploads,
  findUpload,
  saveUpload,
  updateUpload,
} from "../../db/json.ts";
import { bucketName, isMockStorage, s3Client } from "../../storage.ts";
import {
  abortMockMultipartUpload,
  completeMockMultipartUpload,
  createMockMultipartUpload,
  deleteMockObject,
  headMockObject,
  putMockObject,
  uploadMockPart,
} from "../../storage/mock.ts";
import { CompleteUploadSchema } from "./schema.ts";

type UploadStrategy = "auto" | "single" | "multipart";

type UploadPart = {
  partNumber: number;
  etag: string;
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

async function deleteOrAbortUpload(upload: {
  key: string;
  strategy: "single" | "multipart";
  multipartUploadId?: string;
}): Promise<void> {
  if (isMockStorage) {
    if (upload.strategy === "multipart" && upload.multipartUploadId) {
      await abortMockMultipartUpload(upload.multipartUploadId);
    } else {
      await deleteMockObject(upload.key);
    }
    return;
  }

  if (upload.strategy === "multipart" && upload.multipartUploadId) {
    await s3Client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucketName,
        Key: upload.key,
        UploadId: upload.multipartUploadId,
      }),
    );
    return;
  }

  await s3Client.send(
    new DeleteObjectCommand({ Bucket: bucketName, Key: upload.key }),
  );
}

async function expireUpload(upload: {
  id: string;
  key: string;
  strategy: "single" | "multipart";
  multipartUploadId?: string;
}): Promise<void> {
  await deleteOrAbortUpload(upload);
  updateUpload(upload.id, { status: "expired" });
}

export async function cleanupExpiredUploads(): Promise<void> {
  const expiredUploads = findExpiredUploads();
  await Promise.all(
    expiredUploads.map(async (expired) => {
      await expireUpload(expired);
    }),
  );
}

export async function handleCreateUpload(c: Context): Promise<Response> {
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
  const expiresAt = now + uploadUrlTtlMs;

  if (strategy === "single") {
    const upload = saveUpload({
      id,
      key,
      expectedSize: size,
      expectedContentType: contentType,
      createdAt: now,
      expiresAt,
      lastActivityAt: now + staleUploadTtlMs,
      strategy,
      parts: [],
      status: "pending",
    });
    const url = isMockStorage
      ? mockUploadUrl(c, upload.id)
      : await getSignedUrl(
        s3Client,
        new PutObjectCommand({
          Bucket: bucketName,
          Key: upload.key,
          ContentType: upload.expectedContentType,
        }),
        { expiresIn: Math.floor(uploadUrlTtlMs / 1000) },
      );

    return c.json({
      uploadId: upload.id,
      key: upload.key,
      strategy: upload.strategy,
      url,
      expiresAt: upload.expiresAt,
    }, 201);
  }

  const multipart = isMockStorage
    ? { UploadId: await createMockMultipartUpload(key, contentType) }
    : await s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: contentType,
      }),
    );
  if (!multipart.UploadId) {
    throw new Error("R2 did not return a multipart upload ID");
  }

  const upload = saveUpload({
    id,
    key,
    expectedSize: size,
    expectedContentType: contentType,
    createdAt: now,
    expiresAt,
    lastActivityAt: now + staleUploadTtlMs,
    strategy,
    multipartUploadId: multipart.UploadId,
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

export async function handleCreatePartUpload(c: Context): Promise<Response> {
  const uploadId = c.req.param("uploadId");
  const partNumber = Number(c.req.param("partNumber"));
  if (!uploadId || !Number.isSafeInteger(partNumber)) {
    return c.json({ error: "Upload not found" }, 404);
  }

  const upload = findUpload(uploadId);
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

  const url = isMockStorage
    ? mockUploadUrl(c, `${upload.id}/parts/${partNumber}`)
    : await getSignedUrl(
      s3Client,
      new UploadPartCommand({
        Bucket: bucketName,
        Key: upload.key,
        UploadId: upload.multipartUploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: Math.floor(uploadUrlTtlMs / 1000) },
    );
  const expiresAt = Math.min(
    upload.expiresAt,
    Date.now() + uploadUrlTtlMs,
  );
  updateUpload(upload.id, {
    expiresAt,
    lastActivityAt: Date.now() + staleUploadTtlMs,
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

export async function handleCompleteUpload(c: Context): Promise<Response> {
  const uploadId = c.req.param("uploadId");
  if (!uploadId) return c.json({ error: "Upload not found" }, 404);
  const upload = findUpload(uploadId);
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
    if (!Array.isArray(parts) || parts.length === 0) {
      return c.json({ error: "Multipart parts are required" }, 400);
    }
    const partNumbers = new Set<number>();
    for (const part of parts) {
      if (
        !Number.isSafeInteger(part.partNumber) ||
        part.partNumber < 1 ||
        part.partNumber > 10_000 ||
        typeof part.etag !== "string" ||
        part.etag.trim().length === 0 ||
        partNumbers.has(part.partNumber)
      ) {
        return c.json({ error: "Invalid multipart parts" }, 400);
      }
      partNumbers.add(part.partNumber);
    }
    parts = [...parts].sort((a, b) => a.partNumber - b.partNumber);

    if (isMockStorage) {
      await completeMockMultipartUpload(upload.multipartUploadId, parts);
    } else {
      await s3Client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucketName,
          Key: upload.key,
          UploadId: upload.multipartUploadId,
          MultipartUpload: {
            Parts: parts.map((part) => ({
              ETag: part.etag,
              PartNumber: part.partNumber,
            })),
          },
        }),
      );
    }
    updateUpload(upload.id, { parts });
  }

  const object = isMockStorage
    ? await headMockObject(upload.key)
    : await s3Client.send(
      new HeadObjectCommand({ Bucket: bucketName, Key: upload.key }),
    );
  if (!object) {
    updateUpload(upload.id, { status: "failed" });
    return c.json({ error: "Uploaded object does not exist" }, 422);
  }
  if (
    object.ContentLength !== upload.expectedSize ||
    object.ContentType !== upload.expectedContentType
  ) {
    if (isMockStorage) {
      await deleteMockObject(upload.key);
    } else {
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: bucketName, Key: upload.key }),
      );
    }
    updateUpload(upload.id, { status: "failed" });
    return c.json({ error: "Uploaded object does not match metadata" }, 422);
  }

  updateUpload(upload.id, { status: "complete", verifiedAt: Date.now() });
  return c.json({ uploadId: upload.id, status: "complete" });
}

export async function handleAbortUpload(c: Context): Promise<Response> {
  const uploadId = c.req.param("uploadId");
  if (!uploadId) return c.json({ error: "Upload not found" }, 404);
  const upload = findUpload(uploadId);
  if (!upload || upload.status !== "pending") {
    return c.json({ error: "Upload not found" }, 404);
  }

  await deleteOrAbortUpload(upload);
  updateUpload(upload.id, { status: "aborted" });
  return c.json({ uploadId: upload.id, status: "aborted" });
}

export async function handleExtendVerification(c: Context): Promise<Response> {
  const uploadId = c.req.param("uploadId");
  if (!uploadId) return c.json({ error: "Upload not found" }, 404);

  const upload = findUpload(uploadId);
  if (!upload || upload.status !== "pending") {
    return c.json({ error: "Upload not found" }, 404);
  }

  const now = Date.now();
  if (upload.expiresAt <= now) {
    await expireUpload(upload);
    return c.json({ error: "Upload expired" }, 410);
  }

  const expiresAt = Math.min(
    upload.expiresAt + uploadUrlTtlMs,
    upload.createdAt + maxUploadLifetimeMs,
  );
  updateUpload(upload.id, {
    expiresAt,
    lastActivityAt: now + staleUploadTtlMs,
  });

  return c.json({ uploadId: upload.id, expiresAt });
}

function isMockUploadRequest(c: Context): boolean {
  return isMockStorage && c.req.param("uploadId") !== undefined;
}

export async function handleMockSinglePut(c: Context): Promise<Response> {
  const uploadId = c.req.param("uploadId");
  if (!isMockUploadRequest(c) || !uploadId) return c.notFound();
  const upload = findUpload(uploadId);
  if (!upload || upload.status !== "pending" || upload.strategy !== "single") {
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
  if (body.byteLength > maxUploadBytes) {
    return c.json({ error: "Upload exceeds the configured size limit" }, 413);
  }
  const etag = await putMockObject(
    upload.key,
    body,
    upload.expectedContentType,
  );
  updateUpload(upload.id, { lastActivityAt: Date.now() + staleUploadTtlMs });
  return new Response(null, { status: 200, headers: { etag } });
}

export async function handleMockPartPut(c: Context): Promise<Response> {
  const uploadId = c.req.param("uploadId");
  if (!isMockUploadRequest(c) || !uploadId) return c.notFound();
  const partNumber = Number(c.req.param("partNumber"));
  const upload = findUpload(uploadId);
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
  if (body.byteLength > maxUploadBytes) {
    return c.json({ error: "Upload exceeds the configured size limit" }, 413);
  }

  const etag = await uploadMockPart(upload.multipartUploadId, partNumber, body);
  updateUpload(upload.id, { lastActivityAt: Date.now() + staleUploadTtlMs });
  return new Response(null, { status: 200, headers: { etag } });
}
