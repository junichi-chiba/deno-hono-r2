import { z } from "zod";

export const UploadPartSchema = z.object({
  partNumber: z.number().int().positive().max(10_000),
  etag: z.string().min(1),
});
export type UploadPart = z.infer<typeof UploadPartSchema>;

export const UploadRecordSchema = z.object({
  id: z.uuid(),
  key: z.string().min(1),
  expectedSize: z.number().int().positive(),
  expectedContentType: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  lastActivityAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  strategy: z.enum(["single", "multipart"]).default("single"),
  multipartUploadId: z.string().min(1).optional(),
  parts: z.array(UploadPartSchema).default([]),
  status: z.enum(["pending", "complete", "failed", "expired", "aborted"]),
  verifiedAt: z.number().int().nonnegative().optional(),
});

export type UploadRecord = z.infer<typeof UploadRecordSchema>;
export type UploadRecordInput = z.input<typeof UploadRecordSchema>;
