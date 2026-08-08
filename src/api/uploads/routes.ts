import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  handleCompleteUpload,
  handleCreateUpload,
  handleExtendVerification,
} from "./handler.ts";
import { createUploadSchema, uploadIdSchema } from "./schema.ts";

export const uploadRoutes = new Hono()
  .post(
    "/",
    zValidator("json", createUploadSchema),
    handleCreateUpload,
  )
  .post(
    "/:uploadId/complete",
    zValidator("param", uploadIdSchema),
    handleCompleteUpload,
  )
  .post(
    "/:uploadId/extend",
    zValidator("param", uploadIdSchema),
    handleExtendVerification,
  );
