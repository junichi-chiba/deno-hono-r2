import { UploadRecordSchema } from "../../domain/upload.ts";
import type { UploadRecord, UploadRecordInput } from "../../domain/upload.ts";
import {
  type ObjectMetadata,
  ObjectMetadataSchema,
} from "../../domain/object.ts";
import type { ObjectMetadataStore } from "../../domain/ports.ts";
import { mockStorageDelay } from "../../storage/mock/delay.ts";

export class MemoryObjectMetadataStore implements ObjectMetadataStore {
  readonly #metadata = new Map<string, ObjectMetadata>();

  async save(metadata: ObjectMetadata): Promise<void> {
    await mockStorageDelay();
    const validatedMetadata = ObjectMetadataSchema.parse(metadata);
    this.#metadata.set(validatedMetadata.key, validatedMetadata);
    return Promise.resolve();
  }

  list(): Promise<ObjectMetadata[]> {
    return Promise.resolve(
      [...this.#metadata.values()].map((metadata) => ({ ...metadata })),
    );
  }

  find(key: string): Promise<ObjectMetadata | undefined> {
    const metadata = this.#metadata.get(key);
    return Promise.resolve(metadata ? { ...metadata } : undefined);
  }

  findByDigest(contentDigest: string): Promise<ObjectMetadata | undefined> {
    const normalizedDigest = contentDigest.toLowerCase();
    const metadata = [...this.#metadata.values()].find(
      (item) =>
        item.contentDigest.toLowerCase() === normalizedDigest &&
        item.status === "active",
    );
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

  findPendingByDigest(contentDigest: string): UploadRecord | undefined {
    return [...this.#uploads.values()].find(
      (upload) =>
        upload.status === "pending" &&
        upload.expectedContentDigest === contentDigest,
    );
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
