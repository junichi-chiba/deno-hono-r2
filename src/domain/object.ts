import { z } from "zod";

export const ObjectMetadataSchema = z.object({
  key: z.string().min(1),
  size: z.number().int().nonnegative(),
  contentType: z.string().min(1),
  etag: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type ObjectMetadata = z.infer<typeof ObjectMetadataSchema>;
