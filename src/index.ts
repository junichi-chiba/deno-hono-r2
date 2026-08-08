import { createApp } from "./app.ts";
import {
  createObjectMetadataStore,
  createUploadRepository,
} from "./db/factory.ts";
import { appConfig } from "./env.ts";
import { createStorage } from "./storage/factory.ts";
import { registerExpiredUploadCleanup } from "./jobs/cleanup.ts";

const objectMetadataStore = createObjectMetadataStore();
const objectStorage = createStorage(objectMetadataStore);
const uploadRepository = createUploadRepository();
const dependencies = {
  objectStorage,
  uploadRepository,
  config: appConfig,
};
const app = createApp(dependencies);

export default app;

if (import.meta.main) {
  registerExpiredUploadCleanup(dependencies);
  Deno.serve(app.fetch);
}
