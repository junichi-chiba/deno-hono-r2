import { S3Client } from "s3";
import { env } from "../env.ts";
import { MemoryObjectStorage } from "./mock/memory.ts";
import { FileObjectStorage } from "./mock/file.ts";
import { R2ObjectStorage } from "./r2.ts";
import type { ObjectStorage } from "./ports.ts";

export function createObjectStorage(): ObjectStorage {
  switch (env.CLOUDFLARE_R2_STORAGE_MODE) {
    case "mock-memory":
      return new MemoryObjectStorage();
    case "mock-file":
      return new FileObjectStorage();
    case "r2": {
      const client = new S3Client({
        region: "auto",
        endpoint:
          `https://${env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
          secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
        },
      });
      return new R2ObjectStorage({
        accountId: env.CLOUDFLARE_R2_ACCOUNT_ID,
        accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
        secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
        bucketName: env.CLOUDFLARE_R2_BUCKET_NAME,
      }, client);
    }
    default:
      throw new Error("Unsupported storage mode");
  }
}
