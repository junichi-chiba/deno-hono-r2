import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "s3";
import type { Context } from "hono";
import { bucketName, s3Client } from "../../storage.ts";
import { maxUploadBytes } from "../../env.ts";

export async function handleGetObject(c: Context): Promise<Response> {
  const key = c.req.param("key");
  try {
    const object = await s3Client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: key }),
    );
    if (!object.Body) return c.notFound();
    if (object.ContentType) c.header("content-type", object.ContentType);
    if (object.ETag) c.header("etag", object.ETag);
    return c.body(object.Body.transformToWebStream() as ReadableStream);
  } catch (error) {
    if (error instanceof Error && error.name === "NoSuchKey") {
      return c.notFound();
    }
    throw error;
  }
}

export async function handlePutObject(c: Context): Promise<Response> {
  const key = c.req.param("key");
  const body = new Uint8Array(await c.req.raw.arrayBuffer());
  if (body.byteLength > maxUploadBytes) {
    return c.json({ error: "Upload exceeds the configured size limit" }, 413);
  }
  const result = await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: c.req.header("content-type") ?? "application/octet-stream",
    }),
  );
  return c.json({ key, etag: result.ETag }, 201);
}

export async function handleDeleteObject(c: Context): Promise<Response> {
  const key = c.req.param("key");
  await s3Client.send(
    new DeleteObjectCommand({ Bucket: bucketName, Key: key }),
  );
  return c.body(null, 204);
}
