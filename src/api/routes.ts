import { Hono } from "hono";
import type { AppConfig } from "../env.ts";
import type { ObjectStorage } from "../storage/interfaces.ts";
import type { UploadRepository } from "../db/upload-repository.ts";
import { createObjectRoutes } from "./objects/routes.ts";
import { createUploadRoutes } from "./uploads/routes.ts";

export function createApi(
  storage: ObjectStorage,
  uploads: UploadRepository,
  config: AppConfig,
): Hono {
  return new Hono()
    .route("/objects", createObjectRoutes(storage, config))
    .route("/uploads", createUploadRoutes(storage, uploads, config));
}
