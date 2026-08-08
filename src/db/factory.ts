import { MemoryUploadRepository } from "./mock/memory.ts";
import type { UploadRepository } from "./upload-repository.ts";

export function createUploadRepository(): UploadRepository {
  return new MemoryUploadRepository();
}
