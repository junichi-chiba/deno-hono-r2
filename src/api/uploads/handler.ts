import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from "s3";
import { getSignedUrl } from "presigner";
import type { Context } from "hono";
import {
  maxUploadLifetimeMs,
  staleUploadTtlMs,
  uploadUrlTtlMs,
} from "../../env.ts";
import { bucketName, s3Client } from "../../storage.ts";
import {
  findExpiredUploads,
  findUpload,
  saveUpload,
  updateUpload,
} from "../../db/json.ts";

export async function handleCreateUpload(c: Context): Promise<Response> {
  const expiredUploads = findExpiredUploads();
  await Promise.all(
    expiredUploads.map(async (expired) => {
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: bucketName, Key: expired.key }),
      );
      updateUpload(expired.id, { status: "expired" });
    }),
  );

  const { size, contentType } = await c.req.json<{
    size: number;
    contentType: string;
  }>();
  const id = crypto.randomUUID();
  const upload = saveUpload({
    id,
    key: `uploads/${id}`,
    expectedSize: size,
    expectedContentType: contentType,
    createdAt: Date.now(),
    expiresAt: Date.now() + uploadUrlTtlMs,
    lastActivityAt: Date.now() + staleUploadTtlMs,
    status: "pending",
  });
  const url = await getSignedUrl(
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
    url,
    expiresAt: upload.expiresAt,
  }, 201);
}

export async function handleCompleteUpload(c: Context): Promise<Response> {
  const uploadId = c.req.param("uploadId");
  if (!uploadId) return c.json({ error: "Upload not found" }, 404);
  const upload = findUpload(uploadId);
  if (!upload || upload.status !== "pending") {
    return c.json({ error: "Upload not found" }, 404);
  }
  if (upload.expiresAt <= Date.now()) {
    updateUpload(upload.id, { status: "expired" });
    return c.json({ error: "Upload expired" }, 410);
  }

  const object = await s3Client.send(
    new HeadObjectCommand({ Bucket: bucketName, Key: upload.key }),
  );
  if (
    object.ContentLength !== upload.expectedSize ||
    object.ContentType !== upload.expectedContentType
  ) {
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: bucketName, Key: upload.key }),
    );
    updateUpload(upload.id, { status: "failed" });
    return c.json({ error: "Uploaded object does not match metadata" }, 422);
  }

  updateUpload(upload.id, { status: "complete", verifiedAt: Date.now() });
  return c.json({ uploadId: upload.id, status: "complete" });
}

export function handleExtendVerification(c: Context): Response {
  const uploadId = c.req.param("uploadId");
  if (!uploadId) return c.json({ error: "Upload not found" }, 404);

  const upload = findUpload(uploadId);
  if (!upload || upload.status !== "pending") {
    return c.json({ error: "Upload not found" }, 404);
  }

  const now = Date.now();
  if (upload.expiresAt <= now) {
    updateUpload(upload.id, { status: "expired" });
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
