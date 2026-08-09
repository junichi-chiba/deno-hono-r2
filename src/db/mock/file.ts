import {
  type ObjectMetadata,
  ObjectMetadataSchema,
} from "../../domain/object.ts";
import type {
  CompletedContentInput,
  CompletedContentResult,
} from "../../domain/content.ts";
import type { ObjectMetadataStore } from "../../domain/ports.ts";
import { UploadRecordSchema } from "../../domain/upload.ts";
import type { UploadRecord, UploadRecordInput } from "../../domain/upload.ts";
import type { UploadRepository } from "../upload-repository.ts";

const metadataPath = "tmp/db/metadata/objects.json";

type MetadataIndex = Record<string, ObjectMetadata>;

function parseMetadataEntry(
  storageKey: string,
  value: unknown,
): ObjectMetadata {
  try {
    return ObjectMetadataSchema.parse(value);
  } catch {
    const legacy = value as {
      key?: string;
      size: number;
      contentType: string;
      contentDigest: string;
      etag: string;
      createdAt: number;
      updatedAt: number;
      status?: "active" | "duplicate" | "deleted";
      duplicateOf?: string;
    };
    const key = legacy.key ?? storageKey;
    return ObjectMetadataSchema.parse({
      ...legacy,
      contentDigest: legacy.contentDigest.toLowerCase(),
      activeStorageKey: legacy.status === "duplicate"
        ? legacy.duplicateOf ?? key
        : key,
      completedUploadIds: [key],
      duplicateStorageKeys: legacy.status === "duplicate"
        ? [{
          key,
          uploadId: key,
          etag: legacy.etag,
          status: "duplicate",
          completedAt: legacy.updatedAt,
          retentionUntil: legacy.updatedAt,
        }]
        : [],
      status: legacy.status === "deleted" ? "deleted" : "active",
    });
  }
}

async function readMetadataIndex(): Promise<MetadataIndex> {
  try {
    const parsed = JSON.parse(await Deno.readTextFile(metadataPath));
    return Object.entries(parsed).reduce<MetadataIndex>(
      (index, [digest, value]) => {
        const metadata = parseMetadataEntry(digest, value);
        const existing = index[metadata.contentDigest];
        if (!existing) {
          index[metadata.contentDigest] = metadata;
        } else {
          const duplicateStorageKeys = [
            ...existing.duplicateStorageKeys,
            ...metadata.duplicateStorageKeys,
          ].filter((duplicate, position, duplicates) =>
            duplicates.findIndex((candidate) =>
              candidate.key === duplicate.key
            ) ===
              position
          );
          index[metadata.contentDigest] = {
            ...(metadata.createdAt < existing.createdAt ? metadata : existing),
            completedUploadIds: [
              ...new Set([
                ...existing.completedUploadIds,
                ...metadata.completedUploadIds,
              ]),
            ],
            duplicateStorageKeys,
            status:
              existing.status === "deleted" || metadata.status === "deleted"
                ? "deleted"
                : "active",
            updatedAt: Math.max(existing.updatedAt, metadata.updatedAt),
          };
        }
        return index;
      },
      {},
    );
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return {};
    throw error;
  }
}

async function writeMetadataIndex(index: MetadataIndex): Promise<void> {
  await Deno.mkdir("tmp/db/metadata", { recursive: true });
  await Deno.writeTextFile(metadataPath, `${JSON.stringify(index, null, 2)}\n`);
}

export class FileObjectMetadataStore implements ObjectMetadataStore {
  #claims = Promise.resolve();

  async #withClaim<T>(operation: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.#claims;
    this.#claims = previous.then(() =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async save(metadata: ObjectMetadata): Promise<void> {
    const index = await readMetadataIndex();
    const validated = ObjectMetadataSchema.parse(metadata);
    index[validated.contentDigest] = validated;
    await writeMetadataIndex(index);
  }

  async list(): Promise<ObjectMetadata[]> {
    return Object.values(await readMetadataIndex());
  }

  async find(key: string): Promise<ObjectMetadata | undefined> {
    return Object.values(await readMetadataIndex()).find((metadata) =>
      metadata.activeStorageKey === key ||
      metadata.duplicateStorageKeys.some((duplicate) => duplicate.key === key)
    );
  }

  async findByDigest(
    contentDigest: string,
  ): Promise<ObjectMetadata | undefined> {
    return (await readMetadataIndex())[contentDigest.toLowerCase()];
  }

  async resolveCompleted(
    content: CompletedContentInput,
  ): Promise<CompletedContentResult> {
    return await this.#withClaim(async () => {
      const index = await readMetadataIndex();
      const digest = content.contentDigest.toLowerCase();
      const existing = index[digest];
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
        index[digest] = metadata;
        await writeMetadataIndex(index);
        return { metadata, key: content.key, status: "active" };
      }
      if (existing.completedUploadIds.includes(uploadId)) {
        return {
          metadata: existing,
          key: content.key,
          status: existing.activeStorageKey === content.key
            ? "active"
            : "duplicate",
          ...(existing.activeStorageKey === content.key
            ? {}
            : { duplicateOf: existing.activeStorageKey }),
        };
      }
      const metadata = ObjectMetadataSchema.parse({
        ...existing,
        completedUploadIds: [...existing.completedUploadIds, uploadId],
        duplicateStorageKeys: [
          ...existing.duplicateStorageKeys,
          {
            key: content.key,
            uploadId,
            etag: content.etag,
            status: "duplicate",
            completedAt: content.updatedAt,
            retentionUntil: content.retentionUntil ?? content.updatedAt,
          },
        ],
        updatedAt: content.updatedAt,
      });
      index[digest] = metadata;
      await writeMetadataIndex(index);
      return {
        metadata,
        key: content.key,
        status: "duplicate",
        duplicateOf: existing.activeStorageKey,
      };
    });
  }

  async markDeleted(key: string, updatedAt: number): Promise<void> {
    await this.#withClaim(async () => {
      const metadata = await this.find(key);
      if (!metadata) return;
      if (metadata.activeStorageKey === key) {
        await this.save({ ...metadata, status: "deleted", updatedAt });
        return;
      }
      await this.save({
        ...metadata,
        duplicateStorageKeys: metadata.duplicateStorageKeys.map((item) =>
          item.key === key ? { ...item, status: "deleted" as const } : item
        ),
        updatedAt,
      });
    });
  }

  async removeDuplicate(contentDigest: string, key: string): Promise<void> {
    await this.#withClaim(async () => {
      const index = await readMetadataIndex();
      const metadata = index[contentDigest.toLowerCase()];
      if (!metadata) return;
      index[metadata.contentDigest] = {
        ...metadata,
        duplicateStorageKeys: metadata.duplicateStorageKeys.map((item) =>
          item.key === key ? { ...item, status: "deleted" as const } : item
        ),
        updatedAt: Date.now(),
      };
      await writeMetadataIndex(index);
    });
  }
}

export class FileObjectMetadataRepository extends FileObjectMetadataStore {}

// Upload state is deliberately process-local. It is disposable lifecycle state,
// unlike the digest metadata above.
export class FileUploadRepository implements UploadRepository {
  readonly #uploads = new Map<string, UploadRecord>();

  save(upload: UploadRecordInput): UploadRecord {
    const value = UploadRecordSchema.parse(upload);
    this.#uploads.set(value.id, value);
    return value;
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
    return [...this.#uploads.values()].filter((upload) =>
      upload.status === "pending" &&
      (upload.expiresAt <= now || upload.lastActivityAt <= now)
    );
  }

  delete(id: string): void {
    this.#uploads.delete(id);
  }
}
