import { z } from "zod";
import { ObjectMetadataSchema } from "./object.ts";

export const UploadPartSchema = z.object({
  partNumber: z.number().int().positive().max(10_000),
  etag: z.string().min(1),
  checksumSHA256: z.string().min(1).optional(),
});
export type UploadPart = z.infer<typeof UploadPartSchema>;

const PendingUploadContentSchema = ObjectMetadataSchema.pick({
  size: true,
  contentType: true,
  contentDigest: true,
});

export const UploadRecordSchema = ObjectMetadataSchema.pick({
  key: true,
}).extend({
  id: z.uuid(),
  expectedSize: PendingUploadContentSchema.shape.size,
  expectedContentType: PendingUploadContentSchema.shape.contentType,
  expectedContentDigest: PendingUploadContentSchema.shape.contentDigest,
  retryCount: z.number().int().nonnegative().default(0),
  createdAt: z.number().int().nonnegative(),
  lastActivityAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  strategy: z.enum(["single", "multipart"]).default("single"),
  multipartUploadId: z.string().min(1).optional(),
  parts: z.array(UploadPartSchema).default([]),
  partChecksums: z.record(z.string(), z.string()).default({}),
  status: z.enum([
    "pending",
    "complete",
    "duplicate",
    "failed",
    "expired",
    "aborted",
  ]),
  duplicateOf: z.string().min(1).optional(),
  verifiedAt: z.number().int().nonnegative().optional(),
});

export type UploadRecord = z.infer<typeof UploadRecordSchema>;
export type UploadRecordInput = z.input<typeof UploadRecordSchema>;
