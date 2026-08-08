import { createApp } from "./app.ts";
import { createUploadRepository } from "./db/create.ts";
import { appConfig } from "./env.ts";
import { createStorage } from "./storage/create.ts";
import { registerCron } from "./cron.ts";

const objectStorage = createStorage();
const uploadRepository = createUploadRepository();
const dependencies = {
  objectStorage,
  uploadRepository,
  config: appConfig,
};
const app = createApp(dependencies);

export default app;

if (import.meta.main) {
  registerCron(dependencies);
  Deno.serve(app.fetch);
}
