import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { AppConfig } from "../../env.ts";
import type { ObjectStorage } from "../../storage/types.ts";
import { createObjectHandlers } from "./handler.ts";
import { ObjectKeySchema } from "./schema.ts";
import { validateUpload } from "./validation.ts";

export function createObjectRoutes(
  storage: ObjectStorage,
  config: AppConfig,
): Hono {
  const handlers = createObjectHandlers(storage, config);
  return new Hono()
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
