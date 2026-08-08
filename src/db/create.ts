import { MemoryUploadRepository } from "./memory.ts";
import type { UploadRepository } from "./upload-repository.ts";

export function createUploadRepository(): UploadRepository {
  return new MemoryUploadRepository();
}
