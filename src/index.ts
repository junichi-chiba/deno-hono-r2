import { createApp } from "./app.ts";
import { createUploadRepository } from "./db/factory.ts";
import { appConfig } from "./env.ts";
import { createStorage } from "./storage/factory.ts";
import { registerCron } from "./jobs/cleanup.ts";

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
