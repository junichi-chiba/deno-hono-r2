import { z } from "zod";
import { maxUploadBytes } from "../../env.ts";

export const createUploadSchema = z.object({
  size: z.number().int().positive().max(maxUploadBytes),
  contentType: z.string().trim().min(1).max(255),
});

export const uploadIdSchema = z.object({
  uploadId: z.uuid(),
});
