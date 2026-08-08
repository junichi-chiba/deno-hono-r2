import { createApp, createUploadRepository } from "./app.ts";
import { appConfig } from "./env.ts";
import { createObjectStorage } from "./storage/factory.ts";
import { registerCron } from "./cron.ts";

const objectStorage = createObjectStorage();
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
