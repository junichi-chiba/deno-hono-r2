import { z } from "zod";

const EnvSchema = z.object({
  CLOUDFLARE_R2_ACCOUNT_ID: z.string().trim().min(1),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().trim().min(1),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().trim().min(1),
  CLOUDFLARE_R2_BUCKET_NAME: z.string().trim().min(1),
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
});

const result = EnvSchema.safeParse(Deno.env.toObject());

if (!result.success) {
  console.error(z.prettifyError(result.error));
  throw new Error("Invalid deployment configuration");
}

export const env = result.data;
export const maxUploadBytes = env.CLOUDFLARE_R2_MAX_UPLOAD_BYTES;
export const uploadUrlTtlMs = env.CLOUDFLARE_R2_UPLOAD_URL_TTL_MS;
export const staleUploadTtlMs = env.CLOUDFLARE_R2_STALE_UPLOAD_TTL_MS;
export const maxUploadLifetimeMs = env.CLOUDFLARE_R2_MAX_UPLOAD_LIFETIME_MS;
