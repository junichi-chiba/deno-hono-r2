import type { ObjectMetadataStore } from "../../domain/ports.ts";
import {
  deleteLocalObject,
  readLocalObject,
  writeLocalObject,
} from "./file-store.ts";
import type {
  ObjectInfo,
  ObjectStorage,
  SignedObjectUploadInput,
  SignedUploadPartInput,
  StoredObject,
} from "../interfaces.ts";
import { mockStorageDelay } from "./delay.ts";
import { sha256Base64 } from "../../domain/object.ts";

const multipartDirectory = "tmp/db/objects/.multipart";

type MultipartManifest = {
  key: string;
  contentType: string;
  parts: Record<string, string>;
};

function uploadDirectory(uploadId: string): string {
  if (!/^[0-9a-f-]+$/.test(uploadId)) {
    throw new Error("Invalid multipart upload ID");
  }
  return `${multipartDirectory}/${uploadId}`;
}

function partPath(uploadId: string, partNumber: number): string {
  return `${uploadDirectory(uploadId)}/parts/${partNumber}`;
}

async function readManifest(uploadId: string): Promise<MultipartManifest> {
  try {
    return JSON.parse(
      await Deno.readTextFile(`${uploadDirectory(uploadId)}/manifest.json`),
    ) as MultipartManifest;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error("Multipart upload not found");
    }
    throw error;
  }
}

async function removeUploadDirectory(uploadId: string): Promise<void> {
  try {
    await Deno.remove(uploadDirectory(uploadId), { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

async function etag(body: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", body.slice());
  const hex = [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `"${hex}"`;
}

export async function putMockObject(
  _metadataStore: ObjectMetadataStore,
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<string> {
  await mockStorageDelay();
  await writeLocalObject(key, body);
  void contentType;
  return await etag(body);
}

export async function headMockObject(
  metadataStore: ObjectMetadataStore,
  key: string,
  contentTypes = new Map<string, string>(),
): Promise<
  {
    ContentLength: number;
    ContentType: string;
    ETag: string;
    ChecksumSHA256: string;
  } | undefined
> {
  const body = await readLocalObject(key);
  if (!body) return undefined;
  return {
    ContentLength: body.byteLength,
    ContentType: contentTypes.get(key) ??
      (await metadataStore.find(key))?.contentType ??
      "application/octet-stream",
    ETag: await etag(body),
    ChecksumSHA256: await sha256Base64(body),
  };
}

export async function deleteMockObject(
  _metadataStore: ObjectMetadataStore,
  key: string,
): Promise<void> {
  await deleteLocalObject(key);
}

export async function createMockMultipartUpload(
  key: string,
  contentType: string,
): Promise<string> {
  const uploadId = crypto.randomUUID();
  const directory = uploadDirectory(uploadId);
  await Deno.mkdir(directory, { recursive: true });
  await Deno.writeTextFile(
    `${directory}/manifest.json`,
    JSON.stringify({ key, contentType, parts: {} } satisfies MultipartManifest),
  );
  return uploadId;
}

export async function uploadMockPart(
  uploadId: string,
  partNumber: number,
  body: Uint8Array,
): Promise<string> {
  const manifest = await readManifest(uploadId);
  const partEtag = await etag(body);
  await Deno.mkdir(`${uploadDirectory(uploadId)}/parts`, { recursive: true });
  await Deno.writeFile(partPath(uploadId, partNumber), body);
  manifest.parts[String(partNumber)] = partEtag;
  await Deno.writeTextFile(
    `${uploadDirectory(uploadId)}/manifest.json`,
    JSON.stringify(manifest),
  );
  return partEtag;
}

export async function completeMockMultipartUpload(
  _metadataStore: ObjectMetadataStore,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<{ key: string; contentType: string }> {
  const manifest = await readManifest(uploadId);
  const orderedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  for (const part of orderedParts) {
    if (manifest.parts[String(part.partNumber)] !== part.etag) {
      throw new Error(`Invalid part ${part.partNumber}`);
    }
  }
  const bodies = await Promise.all(
    orderedParts.map((part) =>
      Deno.readFile(partPath(uploadId, part.partNumber))
    ),
  );

  const size = bodies.reduce((total, body) => total + body.byteLength, 0);
  const body = new Uint8Array(size);
  let offset = 0;
  for (const part of bodies) {
    body.set(part, offset);
    offset += part.byteLength;
  }
  await putMockObject(_metadataStore, manifest.key, body, manifest.contentType);
  await removeUploadDirectory(uploadId);
  return { key: manifest.key, contentType: manifest.contentType };
}

export async function abortMockMultipartUpload(
  uploadId: string,
): Promise<void> {
  await removeUploadDirectory(uploadId);
}

export class MockFileStorage implements ObjectStorage {
  readonly isMock = true;
  readonly #contentTypes = new Map<string, string>();

  constructor(private readonly metadataStore: ObjectMetadataStore) {}

  async putObject(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<string> {
    this.#contentTypes.set(key, contentType);
    return await putMockObject(this.metadataStore, key, body, contentType);
  }

  async getObject(key: string): Promise<StoredObject | undefined> {
    const body = await readLocalObject(key);
    if (!body) return undefined;
    return {
      body,
      ContentLength: body.byteLength,
      ContentType: this.#contentTypes.get(key) ??
        (await this.metadataStore.find(key))?.contentType ??
        "application/octet-stream",
      ETag: await etag(body),
      ChecksumSHA256: await sha256Base64(body),
    };
  }

  async headObject(key: string): Promise<ObjectInfo | undefined> {
    return await headMockObject(this.metadataStore, key, this.#contentTypes);
  }

  async deleteObject(key: string): Promise<void> {
    await deleteMockObject(this.metadataStore, key);
    this.#contentTypes.delete(key);
  }

  async createMultipartUpload(
    key: string,
    contentType: string,
  ): Promise<string> {
    return await createMockMultipartUpload(key, contentType);
  }

  async uploadPart(
    _key: string,
    uploadId: string,
    partNumber: number,
    body: Uint8Array,
  ): Promise<string> {
    return await uploadMockPart(uploadId, partNumber, body);
  }

  async completeMultipartUpload(
    _key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
    _checksumSHA256?: string,
  ): Promise<void> {
    const completed = await completeMockMultipartUpload(
      this.metadataStore,
      uploadId,
      parts,
    );
    this.#contentTypes.set(completed.key, completed.contentType);
  }

  async abortMultipartUpload(_key: string, uploadId: string): Promise<void> {
    await abortMockMultipartUpload(uploadId);
  }

  createSignedUploadUrl(
    _input: SignedObjectUploadInput,
  ): Promise<string> {
    throw new Error("Mock storage uses the mock upload routes");
  }

  createSignedPartUploadUrl(
    _input: SignedUploadPartInput,
  ): Promise<string> {
    throw new Error("Mock storage uses the mock upload routes");
  }
}
