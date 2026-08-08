import { cleanupExpiredUploads } from "../api/uploads/handlers.ts";
import type { UploadDependencies } from "../api/uploads/handlers.ts";
import { env } from "../env.ts";

export function registerExpiredUploadCleanup(deps: UploadDependencies): void {
  Deno.cron(
    "cleanup expired uploads",
    env.CLOUDFLARE_R2_CLEANUP_CRON,
    () => cleanupExpiredUploads(deps),
  );
}
