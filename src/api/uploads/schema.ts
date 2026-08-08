import { z } from "zod";
import { UploadPartSchema } from "../../db/upload-record.ts";
export type { UploadPart } from "../../db/upload-record.ts";

export function createUploadSchema(
  maxUploadBytes: number,
): z.ZodType {
  return z.object({
    size: z.number().int().positive().max(maxUploadBytes),
    contentType: z.string().trim().min(1).max(255),
    strategy: z.enum(["auto", "single", "multipart"]).default("multipart"),
  });
}

export const UploadIdSchema = z.object({
  uploadId: z.uuid(),
});

export const UploadPartParamsSchema = UploadIdSchema.extend({
  partNumber: z.coerce.number().int().positive().max(10_000),
});

export const CompleteUploadSchema = z.object({
  parts: z.array(
    UploadPartSchema,
  ).min(1).max(10_000),
});
