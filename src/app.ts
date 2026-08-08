import { Hono } from "hono";
import type { AppConfig } from "./env.ts";
import { createApi } from "./api/index.ts";
import { MemoryUploadRepository } from "./db/memory.ts";
import type { ObjectStorage } from "./storage/interfaces.ts";
import { healthRoutes } from "./routes/health.ts";
import { welcomeRoutes } from "./pages/welcome.tsx";
import { objectPageRoutes } from "./pages/objects.tsx";
import type { UploadRepository } from "./db/upload-repository.ts";

export type AppDependencies = {
  objectStorage: ObjectStorage;
  uploadRepository: UploadRepository;
  config?: AppConfig;
};

export function createApp(deps: AppDependencies): Hono {
  const config = deps.config ?? {
    maxUploadBytes: 1024 * 1024 * 1024,
    uploadUrlTtlMs: 30 * 60 * 1000,
    staleUploadTtlMs: 30 * 60 * 1000,
    maxUploadLifetimeMs: 60 * 60 * 1000,
  };
  const api = createApi(
    deps.objectStorage,
    deps.uploadRepository,
    config,
  );
  return new Hono()
    .route("/", welcomeRoutes)
    .route("/", objectPageRoutes)
    .route("/health", healthRoutes)
    .route("/api", api);
}

export function createUploadRepository(): UploadRepository {
  return new MemoryUploadRepository();
}
