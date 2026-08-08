import { z } from "zod";

export type UploadPart = {
  partNumber: number;
  etag: string;
};

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
    z.object({
      partNumber: z.number().int().positive().max(10_000),
      etag: z.string().trim().min(1).max(1_024),
    }),
  ).min(1).max(10_000),
});
