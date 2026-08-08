import type { Context, MiddlewareHandler, Next } from "hono";

export function validateUpload(maxUploadBytes: number): MiddlewareHandler {
  return async function uploadValidation(
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
    if (contentLength > maxUploadBytes) {
      return c.json({ error: "Upload exceeds the configured size limit" }, 413);
    }

    await next();
  };
}

const allowedContentTypes = new Set([
  "application/octet-stream",
  "image/jpeg",
  "image/png",
  "application/pdf",
]);
