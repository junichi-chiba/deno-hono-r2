import { MemoryUploadRepository } from "./memory.ts";
import type { UploadRepository } from "./interfaces.ts";

export function createUploadRepository(): UploadRepository {
  return new MemoryUploadRepository();
}
