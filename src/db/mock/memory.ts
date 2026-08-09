import { UploadRecordSchema } from "../../domain/upload.ts";
import type { UploadRecord, UploadRecordInput } from "../../domain/upload.ts";
import {
  type ObjectMetadata,
  ObjectMetadataSchema,
} from "../../domain/object.ts";
import type { ObjectMetadataStore } from "../../domain/ports.ts";
import { mockStorageDelay } from "../../storage/mock/delay.ts";
import type {
  CompletedContentInput,
  CompletedContentResult,
} from "../../domain/content.ts";

export class MemoryObjectMetadataStore implements ObjectMetadataStore {
  readonly #metadata = new Map<string, ObjectMetadata>();
  readonly #claims = new Map<string, Promise<void>>();

  async save(metadata: ObjectMetadata): Promise<void> {
    await mockStorageDelay();
    const validatedMetadata = ObjectMetadataSchema.parse(metadata);
    this.#metadata.set(validatedMetadata.contentDigest, validatedMetadata);
    return Promise.resolve();
  }

  list(): Promise<ObjectMetadata[]> {
    return Promise.resolve(
      [...this.#metadata.values()].map((metadata) => ({
        ...metadata,
        completedUploadIds: [...metadata.completedUploadIds],
        duplicateStorageKeys: [...metadata.duplicateStorageKeys],
      })),
    );
  }

  find(key: string): Promise<ObjectMetadata | undefined> {
    const metadata = [...this.#metadata.values()].find((item) =>
      item.activeStorageKey === key ||
      item.duplicateStorageKeys.some((duplicate) => duplicate.key === key)
    );
    return Promise.resolve(metadata ? { ...metadata } : undefined);
  }

  findByDigest(contentDigest: string): Promise<ObjectMetadata | undefined> {
    const normalizedDigest = contentDigest.toLowerCase();
    const metadata = this.#metadata.get(normalizedDigest);
    return Promise.resolve(metadata ? { ...metadata } : undefined);
  }

  async resolveCompleted(
    content: CompletedContentInput,
  ): Promise<CompletedContentResult> {
    const digest = content.contentDigest.toLowerCase();
    const previous = this.#claims.get(digest) ?? Promise.resolve();
    let release!: () => void;
    const current = previous.then(() =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );
    this.#claims.set(digest, current);
    await previous;
    try {
      const existing = this.#metadata.get(digest);
      const uploadId = content.uploadId ?? content.key;
      if (!existing) {
        const metadata = ObjectMetadataSchema.parse({
          ...content,
          contentDigest: digest,
          activeStorageKey: content.key,
          completedUploadIds: [uploadId],
          duplicateStorageKeys: [],
          status: "active",
        });
        this.#metadata.set(digest, metadata);
        return { metadata, key: content.key, status: "active" };
      }
      if (existing.completedUploadIds.includes(uploadId)) {
        const isActive = existing.activeStorageKey === content.key;
        return {
          metadata: existing,
          key: content.key,
          status: isActive ? "active" : "duplicate",
          ...(isActive ? {} : { duplicateOf: existing.activeStorageKey }),
        };
      }
      const duplicate = {
        key: content.key,
        uploadId,
        etag: content.etag,
        status: "duplicate" as const,
        completedAt: content.updatedAt,
        retentionUntil: content.retentionUntil ?? content.updatedAt,
      };
      const metadata = ObjectMetadataSchema.parse({
        ...existing,
        completedUploadIds: [...existing.completedUploadIds, uploadId],
        duplicateStorageKeys: [...existing.duplicateStorageKeys, duplicate],
        updatedAt: content.updatedAt,
      });
      this.#metadata.set(digest, metadata);
      return {
        metadata,
        key: content.key,
        status: "duplicate",
        duplicateOf: existing.activeStorageKey,
      };
    } finally {
      release();
      if (this.#claims.get(digest) === current) this.#claims.delete(digest);
    }
  }

  async markDeleted(key: string, updatedAt: number): Promise<void> {
    const metadata = await this.find(key);
    if (!metadata) return;
    if (metadata.activeStorageKey === key) {
      this.#metadata.set(metadata.contentDigest, {
        ...metadata,
        status: "deleted",
        updatedAt,
      });
      return;
    }
    this.#metadata.set(metadata.contentDigest, {
      ...metadata,
      duplicateStorageKeys: metadata.duplicateStorageKeys.map((item) =>
        item.key === key ? { ...item, status: "deleted" as const } : item
      ),
      updatedAt,
    });
  }

  removeDuplicate(contentDigest: string, key: string): Promise<void> {
    const metadata = this.#metadata.get(contentDigest.toLowerCase());
    if (!metadata) return Promise.resolve();
    this.#metadata.set(metadata.contentDigest, {
      ...metadata,
      duplicateStorageKeys: metadata.duplicateStorageKeys.map((item) =>
        item.key === key ? { ...item, status: "deleted" as const } : item
      ),
      updatedAt: Date.now(),
    });
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
      (upload) =>
        upload.status === "pending" &&
        (upload.expiresAt <= now || upload.lastActivityAt <= now),
    );
  }

  delete(id: string): void {
    this.#uploads.delete(id);
  }
}
