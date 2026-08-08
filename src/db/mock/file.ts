import {
  type ObjectMetadata,
  ObjectMetadataSchema,
  type ObjectMetadataStore,
} from "../object-metadata.ts";
import { UploadRecordSchema } from "../upload-record.ts";
import type { UploadRecord, UploadRecordInput } from "../upload-record.ts";
import type { UploadRepository } from "../upload-repository.ts";
import { z } from "zod";

const metadataPath = "tmp/db/metadata/objects.json";
const uploadsPath = "tmp/db/uploads/records.json";
const MetadataIndexSchema = z.record(z.string(), ObjectMetadataSchema);
const UploadIndexSchema = z.record(z.string(), UploadRecordSchema);

async function readMetadataIndex(): Promise<Record<string, ObjectMetadata>> {
  try {
    return MetadataIndexSchema.parse(
      JSON.parse(await Deno.readTextFile(metadataPath)),
    );
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return {};
    throw error;
  }
}

async function writeMetadataIndex(
  index: Record<string, ObjectMetadata>,
): Promise<void> {
  await Deno.mkdir("tmp/db/metadata", { recursive: true });
  await Deno.writeTextFile(metadataPath, `${JSON.stringify(index, null, 2)}\n`);
}

export class FileObjectMetadataStore implements ObjectMetadataStore {
  async save(metadata: ObjectMetadata): Promise<void> {
    const index = await readMetadataIndex();
    index[metadata.key] = ObjectMetadataSchema.parse(metadata);
    await writeMetadataIndex(index);
  }

  async find(key: string): Promise<ObjectMetadata | undefined> {
    const index = await readMetadataIndex();
    return index[key];
  }

  async delete(key: string): Promise<void> {
    const index = await readMetadataIndex();
    delete index[key];
    await writeMetadataIndex(index);
  }
}

export class FileObjectMetadataRepository extends FileObjectMetadataStore {}

function readUploadIndex(): Record<string, UploadRecord> {
  try {
    return UploadIndexSchema.parse(
      JSON.parse(Deno.readTextFileSync(uploadsPath)),
    );
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return {};
    throw error;
  }
}

function writeUploadIndex(index: Record<string, UploadRecord>): void {
  Deno.mkdirSync("tmp/db/uploads", { recursive: true });
  Deno.writeTextFileSync(uploadsPath, `${JSON.stringify(index, null, 2)}\n`);
}

export class FileUploadRepository implements UploadRepository {
  save(upload: UploadRecordInput): UploadRecord {
    const index = readUploadIndex();
    const validatedUpload = UploadRecordSchema.parse(upload);
    index[validatedUpload.id] = validatedUpload;
    writeUploadIndex(index);
    return validatedUpload;
  }

  find(id: string): UploadRecord | undefined {
    return readUploadIndex()[id];
  }

  update(
    id: string,
    update: Partial<UploadRecord>,
  ): UploadRecord | undefined {
    const index = readUploadIndex();
    const upload = index[id];
    if (!upload) return undefined;
    const updated = UploadRecordSchema.parse({ ...upload, ...update });
    index[id] = updated;
    writeUploadIndex(index);
    return updated;
  }

  findExpired(now = Date.now()): UploadRecord[] {
    return Object.values(readUploadIndex()).filter(
      (upload) => upload.status === "pending" && upload.lastActivityAt <= now,
    );
  }
}
