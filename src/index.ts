import { createApp } from "./app.ts";
import {
  createObjectMetadataStore,
  createUploadRepository,
} from "./db/factory.ts";
import { appConfig, env } from "./env.ts";
import { createStorage } from "./storage/factory.ts";
import { registerExpiredUploadCleanup } from "./jobs/cleanup.ts";

const objectMetadataStore = createObjectMetadataStore();
const objectStorage = createStorage(objectMetadataStore);
const uploadRepository = createUploadRepository();
const dependencies = {
  objectStorage,
  uploadRepository,
  objectMetadataStore,
  config: appConfig,
};
const app = createApp(dependencies);

export default app;

if (import.meta.main) {
  const dbPath = `${Deno.cwd()}/tmp/db`;
  console.debug("Storage paths", {
    mode: env.CLOUDFLARE_R2_STORAGE_MODE,
    metadata: `${dbPath}/metadata/objects.json`,
    objects: `${dbPath}/objects`,
    multipart: `${dbPath}/objects/.multipart`,
  });
  registerExpiredUploadCleanup(dependencies);
  Deno.serve(app.fetch);
}
