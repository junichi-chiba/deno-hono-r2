import { z } from "zod";
import { UploadPartSchema } from "../../domain/upload.ts";
export type { UploadPart } from "../../domain/upload.ts";

export function createUploadSchema(
  maxUploadBytes: number,
): z.ZodType {
  return z.object({
    size: z.number().int().positive().max(maxUploadBytes),
    contentType: z.string().trim().min(1).max(255),
    contentDigest: z.string().trim().regex(/^[\da-f]{64}$/i),
    strategy: z.enum(["auto", "single", "multipart"]).default("multipart"),
  });
}

export const UploadIdSchema = z.object({
  uploadId: z.uuid(),
});

export const UploadPartParamsSchema = UploadIdSchema.extend({
  partNumber: z.coerce.number().int().positive().max(10_000),
});

export const CreatePartUploadSchema = z.object({
  // Multipart part checksums are required by R2, but remain optional for the
  // mock routes so existing mock clients continue to work.
  contentDigest: z.string().trim().regex(/^[\da-f]{64}$/i).optional(),
  checksumSHA256: z.string().trim().regex(/^[A-Za-z0-9+/]{43}=$/).optional(),
});

export const CompleteUploadSchema = z.object({
  parts: z.array(
    UploadPartSchema,
  ).min(1).max(10_000),
});
