import { cleanupExpiredUploads } from "../api/uploads/handlers.ts";
import type { UploadDependencies } from "../api/uploads/handlers.ts";

export function registerExpiredUploadCleanup(deps: UploadDependencies): void {
  Deno.cron(
    "cleanup expired uploads",
    "*/15 * * * *",
    () => cleanupExpiredUploads(deps),
  );
}
