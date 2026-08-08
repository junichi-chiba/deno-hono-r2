import { z } from "zod";

const EnvSchema = z.object({
  CLOUDFLARE_R2_ACCOUNT_ID: z.string().trim().min(1),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().trim().min(1),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().trim().min(1),
  CLOUDFLARE_R2_BUCKET_NAME: z.string().trim().min(1),
});

const result = EnvSchema.safeParse(Deno.env.toObject());

if (!result.success) {
  console.error(z.prettifyError(result.error));
  throw new Error("Invalid deployment configuration");
}

export const env = result.data;
