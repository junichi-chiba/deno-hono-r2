import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  handleAbortUpload,
  handleCompleteUpload,
  handleCreatePartUpload,
  handleCreateUpload,
  handleExtendVerification,
  handleMockPartPut,
  handleMockSinglePut,
} from "./handler.ts";
import {
  CreateUploadSchema,
  UploadIdSchema,
  UploadPartParamsSchema,
} from "./schema.ts";

export const uploadRoutes = new Hono()
  .post(
    "/",
    zValidator("json", CreateUploadSchema),
    handleCreateUpload,
  )
  .post(
    "/:uploadId/complete",
    zValidator("param", UploadIdSchema),
    handleCompleteUpload,
  )
  .post(
    "/:uploadId/parts/:partNumber",
    zValidator("param", UploadPartParamsSchema),
    handleCreatePartUpload,
  )
  .post(
    "/:uploadId/abort",
    zValidator("param", UploadIdSchema),
    handleAbortUpload,
  )
  .delete(
    "/:uploadId",
    zValidator("param", UploadIdSchema),
    handleAbortUpload,
  )
  .post(
    "/:uploadId/extend",
    zValidator("param", UploadIdSchema),
    handleExtendVerification,
  )
  .put(
    "/mock/:uploadId",
    zValidator("param", UploadIdSchema),
    handleMockSinglePut,
  )
  .put(
    "/mock/:uploadId/parts/:partNumber",
    zValidator("param", UploadPartParamsSchema),
    handleMockPartPut,
  );
