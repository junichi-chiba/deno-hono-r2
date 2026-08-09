import type { Context } from "hono";
import type { AppConfig } from "../../env.ts";
import type { ObjectMetadataStore } from "../../domain/ports.ts";
import type { ObjectStorage } from "../../storage/interfaces.ts";
import { saveCompletedContent } from "../../domain/content.ts";
import { sha256Hex } from "../../domain/object.ts";

export type ObjectHandlers = {
  handleListObjects: (c: Context) => Promise<Response>;
  handleGetObject: (c: Context) => Promise<Response>;
  handlePutObject: (c: Context) => Promise<Response>;
  handleDeleteObject: (c: Context) => Promise<Response>;
};

export function createObjectHandlers(
  storage: ObjectStorage,
  config: AppConfig,
  objectMetadataStore: ObjectMetadataStore,
): ObjectHandlers {
  return {
    handleListObjects: async (c: Context): Promise<Response> => {
      if (!storage.isMock) return c.notFound();
      const metadata = await objectMetadataStore.list();
      return c.json(
        metadata
          .filter((item) => item.status === "active")
          .map(({ key }) => ({ key })),
      );
    },
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
      const now = Date.now();
      await saveCompletedContent(objectMetadataStore, {
        key,
        size: body.byteLength,
        contentType,
        contentDigest: await sha256Hex(body),
        etag,
        createdAt: (await objectMetadataStore.find(key))?.createdAt ?? now,
        updatedAt: now,
      });
      return c.json({ key, etag }, 201);
    },

    handleDeleteObject: async (c: Context): Promise<Response> => {
      const key = c.req.param("key") ?? "";
      const metadata = await objectMetadataStore.find(key);
      await storage.deleteObject(key);
      if (metadata) {
        await objectMetadataStore.save({
          ...metadata,
          status: "deleted",
          updatedAt: Date.now(),
        });
      }
      return c.body(null, 204);
    },
  };
}
