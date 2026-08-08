import { z } from "zod";

const uploadRecordSchema = z.object({
  id: z.uuid(),
  key: z.string().min(1),
  expectedSize: z.number().int().positive(),
  expectedContentType: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  lastActivityAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  status: z.enum(["pending", "complete", "failed", "expired"]),
  verifiedAt: z.number().int().nonnegative().optional(),
});

export type UploadRecord = z.infer<typeof uploadRecordSchema>;

const uploads = new Map<string, UploadRecord>();

export function saveUpload(upload: UploadRecord): UploadRecord {
  const validatedUpload = uploadRecordSchema.parse(upload);
  uploads.set(validatedUpload.id, validatedUpload);
  return validatedUpload;
}

export function findUpload(id: string): UploadRecord | undefined {
  return uploads.get(id);
}

export function updateUpload(
  id: string,
  update: Partial<UploadRecord>,
): UploadRecord | undefined {
  const upload = uploads.get(id);
  if (!upload) return undefined;
  const updated = uploadRecordSchema.parse({ ...upload, ...update });
  uploads.set(id, updated);
  return updated;
}

export function findExpiredUploads(now = Date.now()): UploadRecord[] {
  return [...uploads.values()].filter(
    (upload) => upload.status === "pending" && upload.lastActivityAt <= now,
  );
}
