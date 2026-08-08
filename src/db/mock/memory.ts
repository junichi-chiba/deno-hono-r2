import { UploadRecordSchema } from "../../domain/upload.ts";
import type { UploadRecord, UploadRecordInput } from "../../domain/upload.ts";
import {
  type ObjectMetadata,
  ObjectMetadataSchema,
} from "../../domain/object.ts";
import type { ObjectMetadataStore } from "../object-metadata.ts";

export class MemoryObjectMetadataStore implements ObjectMetadataStore {
  readonly #metadata = new Map<string, ObjectMetadata>();

  save(metadata: ObjectMetadata): Promise<void> {
    const validatedMetadata = ObjectMetadataSchema.parse(metadata);
    this.#metadata.set(validatedMetadata.key, validatedMetadata);
    return Promise.resolve();
  }

  find(key: string): Promise<ObjectMetadata | undefined> {
    const metadata = this.#metadata.get(key);
    return Promise.resolve(metadata ? { ...metadata } : undefined);
  }

  delete(key: string): Promise<void> {
    this.#metadata.delete(key);
    return Promise.resolve();
  }
}

export class MemoryObjectMetadataRepository extends MemoryObjectMetadataStore {}

export class MemoryUploadRepository {
  readonly #uploads = new Map<string, UploadRecord>();

  save(upload: UploadRecordInput): UploadRecord {
    const validatedUpload = UploadRecordSchema.parse(upload);
    this.#uploads.set(validatedUpload.id, validatedUpload);
    return validatedUpload;
  }

  find(id: string): UploadRecord | undefined {
    return this.#uploads.get(id);
  }

  update(
    id: string,
    update: Partial<UploadRecord>,
  ): UploadRecord | undefined {
    const upload = this.#uploads.get(id);
    if (!upload) return undefined;
    const updated = UploadRecordSchema.parse({ ...upload, ...update });
    this.#uploads.set(id, updated);
    return updated;
  }

  findExpired(now = Date.now()): UploadRecord[] {
    return [...this.#uploads.values()].filter(
      (upload) => upload.status === "pending" && upload.lastActivityAt <= now,
    );
  }
}
