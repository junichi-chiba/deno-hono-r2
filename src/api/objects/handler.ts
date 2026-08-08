import type { Context } from "hono";
import { maxUploadBytes } from "../../env.ts";
import {
  deleteObjectMetadata,
  findObjectMetadata,
  saveObjectMetadata,
} from "../../db/metadata.ts";
import {
  deleteLocalObject,
  readLocalObject,
  writeLocalObject,
} from "../../storage/local.ts";

export async function handleGetObject(c: Context): Promise<Response> {
  const key = c.req.param("key") ?? "";
  const body = await readLocalObject(key);
  if (!body) return c.notFound();
  const buffer = new ArrayBuffer(body.byteLength);
  new Uint8Array(buffer).set(body);
  return c.body(buffer, 200, {
    "content-type": (await findObjectMetadata(key))?.contentType ??
      "application/octet-stream",
  });
}

export async function handlePutObject(c: Context): Promise<Response> {
  const key = c.req.param("key") ?? "";
  const body = new Uint8Array(await c.req.raw.arrayBuffer());
  if (body.byteLength > maxUploadBytes) {
    return c.json({ error: "Upload exceeds the configured size limit" }, 413);
  }
  await writeLocalObject(key, body);
  const now = Date.now();
  const contentType = c.req.header("content-type") ??
    "application/octet-stream";
  const digest = await crypto.subtle.digest("SHA-256", body);
  const etag = [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  await saveObjectMetadata({
    key,
    size: body.byteLength,
    contentType,
    etag,
    createdAt: (await findObjectMetadata(key))?.createdAt ?? now,
    updatedAt: now,
  });
  return c.json({ key, etag }, 201);
}

export async function handleDeleteObject(c: Context): Promise<Response> {
  const key = c.req.param("key") ?? "";
  await deleteLocalObject(key);
  await deleteObjectMetadata(key);
  return c.body(null, 204);
}
