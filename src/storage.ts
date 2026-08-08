import { S3Client } from "s3";
import { env } from "./env.ts";

export const bucketName = env.CLOUDFLARE_R2_BUCKET_NAME;
export const isMockStorage = env.CLOUDFLARE_R2_STORAGE_MODE === "mock";
export const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});
