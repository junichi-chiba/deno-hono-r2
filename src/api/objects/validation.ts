import type { Context, Next } from "hono";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const allowedContentTypes = new Set([
  "application/octet-stream",
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

export async function validateUpload(
  c: Context,
  next: Next,
): Promise<void | Response> {
  const contentType = c.req.header("content-type") ??
    "application/octet-stream";
  const contentLength = Number(c.req.header("content-length") ?? 0);

  if (!allowedContentTypes.has(contentType)) {
    return c.json({ error: "Unsupported content type" }, 415);
  }
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    return c.json({ error: "Content-Length is required" }, 411);
  }
  if (contentLength > MAX_UPLOAD_BYTES) {
    return c.json({ error: "Upload exceeds the 10 MB limit" }, 413);
  }

  await next();
}
