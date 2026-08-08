import { Hono } from "hono";
import type { AppConfig } from "./env.ts";
import { createApi } from "./api/routes.ts";
import type { ObjectStorage } from "./storage/interfaces.ts";
import { healthRoutes } from "./routes/health.ts";
import { welcomeRoutes } from "./pages/welcome.tsx";
import { objectPageRoutes } from "./pages/objects.tsx";
import type { UploadRepository } from "./db/upload-repository.ts";
import type { ObjectMetadataStore } from "./domain/ports.ts";

export type AppDependencies = {
  objectStorage: ObjectStorage;
  uploadRepository: UploadRepository;
  objectMetadataStore: ObjectMetadataStore;
  config?: AppConfig;
};

export function createApp(deps: AppDependencies): Hono {
  const config = deps.config ?? {
    maxUploadBytes: 1024 * 1024 * 1024,
    uploadUrlTtlMs: 30 * 60 * 1000,
    staleUploadTtlMs: 30 * 60 * 1000,
    maxUploadLifetimeMs: 60 * 60 * 1000,
    dedupRetryAfterSeconds: 10,
    dedupMaxRetries: 3,
  };
  const api = createApi(
    deps.objectStorage,
    deps.uploadRepository,
    config,
    deps.objectMetadataStore,
  );
  return new Hono()
    .route("/", welcomeRoutes)
    .route("/", objectPageRoutes)
    .route("/health", healthRoutes)
    .route("/api", api);
}
