import type { Context } from "hono";
import type { AppConfig } from "../../env.ts";
import type { ObjectStorage } from "../../storage/ports.ts";

export type ObjectHandlers = {
  handleGetObject: (c: Context) => Promise<Response>;
  handlePutObject: (c: Context) => Promise<Response>;
  handleDeleteObject: (c: Context) => Promise<Response>;
};

export function createObjectHandlers(
  storage: ObjectStorage,
  config: AppConfig,
): ObjectHandlers {
  return {
    handleGetObject: async (c: Context): Promise<Response> => {
      const key = c.req.param("key") ?? "";
      const object = await storage.getObject(key);
      if (!object) return c.notFound();
      const buffer = new ArrayBuffer(object.body.byteLength);
      new Uint8Array(buffer).set(object.body);
      return c.body(buffer, 200, {
        "content-type": object.ContentType ?? "application/octet-stream",
      });
    },

    handlePutObject: async (c: Context): Promise<Response> => {
      const key = c.req.param("key") ?? "";
      const body = new Uint8Array(await c.req.raw.arrayBuffer());
      if (body.byteLength > config.maxUploadBytes) {
        return c.json(
          { error: "Upload exceeds the configured size limit" },
          413,
        );
      }
      const contentType = c.req.header("content-type") ??
        "application/octet-stream";
      const etag = await storage.putObject(key, body, contentType);
      return c.json({ key, etag }, 201);
    },

    handleDeleteObject: async (c: Context): Promise<Response> => {
      await storage.deleteObject(c.req.param("key") ?? "");
      return c.body(null, 204);
    },
  };
}
