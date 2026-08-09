import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { AppConfig } from "../../env.ts";
import type { ObjectMetadataStore } from "../../domain/ports.ts";
import type { ObjectStorage } from "../../storage/interfaces.ts";
import { createObjectHandlers } from "./handlers.ts";
import { ObjectKeySchema } from "./schema.ts";
import { validateUpload } from "./validation.ts";

export function createObjectRoutes(
  storage: ObjectStorage,
  config: AppConfig,
  objectMetadataStore: ObjectMetadataStore,
): Hono {
  const handlers = createObjectHandlers(storage, config, objectMetadataStore);
  return new Hono()
    .get("/", handlers.handleListObjects)
    .get(
      "/:key{.+}",
      zValidator("param", ObjectKeySchema),
      handlers.handleGetObject,
    )
    .put(
      "/:key{.+}",
      zValidator("param", ObjectKeySchema),
      validateUpload(config.maxUploadBytes),
      handlers.handlePutObject,
    )
    .delete(
      "/:key{.+}",
      zValidator("param", ObjectKeySchema),
      handlers.handleDeleteObject,
    );
}
