import { cleanupExpiredUploads } from "./api/uploads/handler.ts";

Deno.cron(
  "cleanup expired uploads",
  "*/15 * * * *",
  cleanupExpiredUploads,
);
