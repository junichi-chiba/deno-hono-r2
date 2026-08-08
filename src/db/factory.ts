import { env } from "../env.ts";
import { FileObjectMetadataStore, FileUploadRepository } from "./mock/file.ts";
import { MemoryUploadRepository } from "./mock/memory.ts";
import { MemoryObjectMetadataStore } from "./mock/memory.ts";
import type { ObjectMetadataStore } from "../domain/ports.ts";
import type { UploadRepository } from "./upload-repository.ts";

export type StorageMode = "r2" | "mock-file" | "mock-memory";

export function createObjectMetadataStore(
  mode: StorageMode = env.CLOUDFLARE_R2_STORAGE_MODE,
): ObjectMetadataStore {
  switch (mode) {
    case "mock-memory":
      return new MemoryObjectMetadataStore();
    case "mock-file":
      return new FileObjectMetadataStore();
    case "r2":
      // Temporary fallback until the MongoDB metadata store is implemented.
      return new MemoryObjectMetadataStore();
  }
}

export function createUploadRepository(
  mode: StorageMode = env.CLOUDFLARE_R2_STORAGE_MODE,
): UploadRepository {
  switch (mode) {
    case "mock-memory":
      return new MemoryUploadRepository();
    case "mock-file":
      return new FileUploadRepository();
    case "r2":
      // Temporary fallback until the MongoDB upload repository is implemented.
      return new MemoryUploadRepository();
  }
}
