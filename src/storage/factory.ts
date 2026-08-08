import { S3Client } from "s3";
import { createObjectMetadataStore } from "../db/factory.ts";
import type { ObjectMetadataStore } from "../db/object-metadata.ts";
import { env } from "../env.ts";
import { MockMemoryStorage } from "./mock/memory.ts";
import { MockFileStorage } from "./mock/file.ts";
import { R2ObjectStorage } from "./r2.ts";
import type { ObjectStorage } from "./interfaces.ts";

export function createStorage(
  metadataStore: ObjectMetadataStore = createObjectMetadataStore(),
): ObjectStorage {
  switch (env.CLOUDFLARE_R2_STORAGE_MODE) {
    case "mock-memory":
      return new MockMemoryStorage();
    case "mock-file":
      return new MockFileStorage(metadataStore);
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
