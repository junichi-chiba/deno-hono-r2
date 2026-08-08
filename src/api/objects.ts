import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "s3";
import { Hono } from "hono";
import type { Context } from "hono";
import { bucketName, s3Client } from "../storage.ts";

const handleGetObject = async (c: Context): Promise<Response> => {
  try {
    const object = await s3Client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: c.req.param("key") }),
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
};

const handlePutObject = async (c: Context): Promise<Response> => {
  const result = await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: c.req.param("key"),
      Body: new Uint8Array(await c.req.raw.arrayBuffer()),
      ContentType: c.req.header("content-type") ?? "application/octet-stream",
    }),
  );
  return c.json({ key: c.req.param("key"), etag: result.ETag }, 201);
};

const handleDeleteObject = async (c: Context): Promise<Response> => {
  await s3Client.send(
    new DeleteObjectCommand({ Bucket: bucketName, Key: c.req.param("key") }),
  );
  return c.body(null, 204);
};

const objectRoutes = new Hono()
  .get("/:key{.+}", handleGetObject)
  .put("/:key{.+}", handlePutObject)
  .delete("/:key{.+}", handleDeleteObject);

export default objectRoutes;
