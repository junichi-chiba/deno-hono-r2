import { DeleteObjectCommand } from "s3";
import { findExpiredUploads, updateUpload } from "./db/json.ts";
import { bucketName, s3Client } from "./storage.ts";

export async function cleanupExpiredUploads(): Promise<void> {
  const expiredUploads = findExpiredUploads();

  await Promise.all(
    expiredUploads.map(async (upload) => {
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: bucketName, Key: upload.key }),
      );
      updateUpload(upload.id, { status: "expired" });
    }),
  );
}

Deno.cron(
  "cleanup expired uploads",
  "*/15 * * * *",
  cleanupExpiredUploads,
);
