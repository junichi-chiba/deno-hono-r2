import type { UploadRecord, UploadRecordInput } from "../domain/upload.ts";

export interface UploadRepository {
  save(upload: UploadRecordInput): UploadRecord;
  find(id: string): UploadRecord | undefined;
  findPendingByDigest(contentDigest: string): UploadRecord | undefined;
  update(id: string, update: Partial<UploadRecord>): UploadRecord | undefined;
  findExpired(now?: number): UploadRecord[];
}
