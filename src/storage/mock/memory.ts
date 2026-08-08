import type {
  ObjectMetadata,
  ObjectStorage,
  SignedObjectUploadInput,
  SignedUploadPartInput,
  StoredObject,
} from "../interfaces.ts";

type UploadPart = {
  partNumber: number;
  etag: string;
};

type MultipartUpload = {
  key: string;
  parts: Map<number, { body: Uint8Array; etag: string }>;
};

export class MultipartMemoryStore {
  readonly #uploads = new Map<string, MultipartUpload>();
  readonly #objects = new Map<string, Uint8Array>();

  createMultipartUpload(key: string): string {
    const uploadId = crypto.randomUUID();
    this.#uploads.set(uploadId, { key, parts: new Map() });
    return uploadId;
  }

  uploadPart(uploadId: string, partNumber: number, body: Uint8Array): string {
    const upload = this.#uploads.get(uploadId);
    if (!upload) throw new Error("Multipart upload not found");

    const etag = `"mock-part-${partNumber}-${crypto.randomUUID()}"`;
    upload.parts.set(partNumber, { body: body.slice(), etag });
    return etag;
  }

  completeMultipartUpload(
    uploadId: string,
    parts: UploadPart[],
  ): { key: string; object: Uint8Array } {
    const upload = this.#uploads.get(uploadId);
    if (!upload) throw new Error("Multipart upload not found");

    const orderedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    const bodies = orderedParts.map(({ partNumber, etag }) => {
      const part = upload.parts.get(partNumber);
      if (!part || part.etag !== etag) {
        throw new Error(`Invalid part ${partNumber}`);
      }
      return part.body;
    });
    const totalSize = bodies.reduce((size, body) => size + body.byteLength, 0);
    const object = new Uint8Array(totalSize);
    let offset = 0;
    for (const body of bodies) {
      object.set(body, offset);
      offset += body.byteLength;
    }

    this.#objects.set(upload.key, object);
    this.#uploads.delete(uploadId);
    return { key: upload.key, object };
  }

  abortMultipartUpload(uploadId: string): void {
    this.#uploads.delete(uploadId);
  }

  get(key: string): Uint8Array | undefined {
    return this.#objects.get(key)?.slice();
  }
}

export class MockMemoryStorage implements ObjectStorage {
  readonly isMock = true;
  readonly #multipart = new MultipartMemoryStore();
  readonly #multipartContentTypes = new Map<string, string>();
  readonly #objects = new Map<
    string,
    { body: Uint8Array; contentType: string }
  >();

  async putObject(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<string> {
    this.#objects.set(key, { body: body.slice(), contentType });
    return await bodyEtag(body);
  }

  getObject(key: string): Promise<StoredObject | undefined> {
    const object = this.#objects.get(key);
    if (!object) return Promise.resolve(undefined);
    return Promise.resolve({
      body: object.body.slice(),
      ContentLength: object.body.byteLength,
      ContentType: object.contentType,
    });
  }

  headObject(key: string): Promise<ObjectMetadata | undefined> {
    const object = this.#objects.get(key);
    if (!object) return Promise.resolve(undefined);
    return Promise.resolve({
      ContentLength: object.body.byteLength,
      ContentType: object.contentType,
    });
  }

  deleteObject(key: string): Promise<void> {
    this.#objects.delete(key);
    return Promise.resolve();
  }

  createMultipartUpload(
    key: string,
    contentType: string,
  ): Promise<string> {
    const uploadId = this.#multipart.createMultipartUpload(key);
    this.#multipartContentTypes.set(uploadId, contentType);
    return Promise.resolve(uploadId);
  }

  uploadPart(
    _key: string,
    uploadId: string,
    partNumber: number,
    body: Uint8Array,
  ): Promise<string> {
    return Promise.resolve(
      this.#multipart.uploadPart(uploadId, partNumber, body),
    );
  }

  completeMultipartUpload(
    _key: string,
    uploadId: string,
    parts: UploadPart[],
  ): Promise<void> {
    const upload = this.#multipart.completeMultipartUpload(uploadId, parts);
    this.#objects.set(upload.key, {
      body: upload.object,
      contentType: this.#multipartContentTypes.get(uploadId) ??
        "application/octet-stream",
    });
    this.#multipartContentTypes.delete(uploadId);
    return Promise.resolve();
  }

  abortMultipartUpload(_key: string, uploadId: string): Promise<void> {
    this.#multipart.abortMultipartUpload(uploadId);
    this.#multipartContentTypes.delete(uploadId);
    return Promise.resolve();
  }

  createSignedUploadUrl(_input: SignedObjectUploadInput): Promise<string> {
    throw new Error("Mock storage uses the mock upload routes");
  }

  createSignedPartUploadUrl(
    _input: SignedUploadPartInput,
  ): Promise<string> {
    throw new Error("Mock storage uses the mock upload routes");
  }
}

async function bodyEtag(body: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", body.slice());
  return `"${
    [...new Uint8Array(digest)].map((byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("")
  }"`;
}
