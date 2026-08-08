import { cleanupExpiredUploads } from "./api/uploads/handler.ts";
import type { UploadDependencies } from "./api/uploads/handler.ts";

export function registerCron(deps: UploadDependencies): void {
  Deno.cron(
    "cleanup expired uploads",
    "*/15 * * * *",
    () => cleanupExpiredUploads(deps),
  );
}
