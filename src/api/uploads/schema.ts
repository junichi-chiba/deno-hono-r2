import { z } from "zod";
import { UploadPartSchema } from "../../domain/upload.ts";
export type { UploadPart } from "../../domain/upload.ts";

const DEFAULT_FORCE_FLAG = false;

export function createUploadSchema(
  maxUploadBytes: number,
): z.ZodType {
  return z.object({
    size: z.number().int().positive().max(maxUploadBytes),
    contentType: z.string().trim().min(1).max(255),
    contentDigest: z.string().trim().regex(/^[\da-f]{64}$/i),
    force: z.boolean().default(DEFAULT_FORCE_FLAG),
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
