import { z } from "zod";

export const ObjectMetadataSchema = z.object({
  key: z.string().min(1),
  size: z.number().int().nonnegative(),
  contentType: z.string().min(1),
  contentDigest: z.string().regex(/^[\da-f]{64}$/i),
  etag: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  status: z.enum(["active", "duplicate", "deleted"]).default("active"),
  duplicateOf: z.string().min(1).optional(),
});

export type ObjectMetadata = z.infer<typeof ObjectMetadataSchema>;

export async function sha256Hex(body: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", body.slice());
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
