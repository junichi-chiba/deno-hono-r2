import { z } from "zod";

const EnvSchema = z.object({
  CLOUDFLARE_R2_STORAGE_MODE: z.enum(["r2", "mock-file", "mock-memory"])
    .default("r2"),
  CLOUDFLARE_R2_ACCOUNT_ID: z.string().trim().default(""),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().trim().default(""),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().trim().default(""),
  CLOUDFLARE_R2_BUCKET_NAME: z.string().trim().default(""),
  CLOUDFLARE_R2_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(
    1024 * 1024 * 1024,
  ),
  CLOUDFLARE_R2_UPLOAD_URL_TTL_MS: z.coerce.number().int().positive().default(
    30 * 60 * 1000,
  ),
  CLOUDFLARE_R2_STALE_UPLOAD_TTL_MS: z.coerce.number().int().positive().default(
    30 * 60 * 1000,
  ),
  CLOUDFLARE_R2_MAX_UPLOAD_LIFETIME_MS: z.coerce.number().int().positive()
    .default(
      60 * 60 * 1000,
    ),
  CLOUDFLARE_R2_DEDUP_RETRY_AFTER_SECONDS: z.coerce.number().int().positive()
    .default(10),
  CLOUDFLARE_R2_DEDUP_MAX_RETRIES: z.coerce.number().int().nonnegative()
    .default(3),
  CLOUDFLARE_R2_CLEANUP_CRON: z.string().trim().min(1).default("*/15 * * * *"),
}).superRefine((values, context) => {
  if (values.CLOUDFLARE_R2_STORAGE_MODE !== "r2") return;

  for (
    const name of [
      "CLOUDFLARE_R2_ACCOUNT_ID",
      "CLOUDFLARE_R2_ACCESS_KEY_ID",
      "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
      "CLOUDFLARE_R2_BUCKET_NAME",
    ] as const
  ) {
    if (!values[name]) {
      context.addIssue({
        code: "custom",
        path: [name],
        message: `${name} is required when R2 storage mode is "r2"`,
      });
    }
  }
});

const result = EnvSchema.safeParse(Deno.env.toObject());

if (!result.success) {
  console.error(z.prettifyError(result.error));
  throw new Error("Invalid deployment configuration");
}

export const env = result.data;

export type AppConfig = {
  maxUploadBytes: number;
  uploadUrlTtlMs: number;
  staleUploadTtlMs: number;
  maxUploadLifetimeMs: number;
  dedupRetryAfterSeconds: number;
  dedupMaxRetries: number;
  cleanupCron: string;
};

export const appConfig: AppConfig = {
  maxUploadBytes: env.CLOUDFLARE_R2_MAX_UPLOAD_BYTES,
  uploadUrlTtlMs: env.CLOUDFLARE_R2_UPLOAD_URL_TTL_MS,
  staleUploadTtlMs: env.CLOUDFLARE_R2_STALE_UPLOAD_TTL_MS,
  maxUploadLifetimeMs: env.CLOUDFLARE_R2_MAX_UPLOAD_LIFETIME_MS,
  dedupRetryAfterSeconds: env.CLOUDFLARE_R2_DEDUP_RETRY_AFTER_SECONDS,
  dedupMaxRetries: env.CLOUDFLARE_R2_DEDUP_MAX_RETRIES,
  cleanupCron: env.CLOUDFLARE_R2_CLEANUP_CRON,
};
