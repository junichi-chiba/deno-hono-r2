import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { AppConfig } from "../../env.ts";
import type { ObjectStorage } from "../../storage/interfaces.ts";
import type { UploadRepository } from "../../db/upload-repository.ts";
import type { ObjectMetadataStore } from "../../domain/ports.ts";
import { createUploadHandlers } from "./handlers.ts";
import {
  createUploadSchema,
  UploadIdSchema,
  UploadPartParamsSchema,
} from "./schema.ts";

export function createUploadRoutes(
  storage: ObjectStorage,
  uploads: UploadRepository,
  config: AppConfig,
  objectMetadataStore: ObjectMetadataStore,
): Hono {
  const handlers = createUploadHandlers({
    objectStorage: storage,
    uploadRepository: uploads,
    config,
    objectMetadataStore,
  });
  return new Hono()
    .post("/cleanup", handlers.handleCleanup)
    .post(
      "/",
      zValidator("json", createUploadSchema(config.maxUploadBytes)),
      handlers.handleCreateUpload,
    )
    .post(
      "/:uploadId/complete",
      zValidator("param", UploadIdSchema),
      handlers.handleCompleteUpload,
    )
    .post(
      "/:uploadId/parts/:partNumber",
      zValidator("param", UploadPartParamsSchema),
      handlers.handleCreatePartUpload,
    )
    .post(
      "/:uploadId/abort",
      zValidator("param", UploadIdSchema),
      handlers.handleAbortUpload,
    )
    .delete(
      "/:uploadId",
      zValidator("param", UploadIdSchema),
      handlers.handleAbortUpload,
    )
    .post(
      "/:uploadId/extend",
      zValidator("param", UploadIdSchema),
      handlers.handleExtendVerification,
    )
    .put(
      "/mock/:uploadId",
      zValidator("param", UploadIdSchema),
      handlers.handleMockSinglePut,
    )
    .put(
      "/mock/:uploadId/parts/:partNumber",
      zValidator("param", UploadPartParamsSchema),
      handlers.handleMockPartPut,
    );
}
