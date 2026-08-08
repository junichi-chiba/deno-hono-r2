export type MultipartPart = {
  partNumber: number;
  etag: string;
};

type MultipartUpload = {
  key: string;
  parts: Map<number, { body: Uint8Array; etag: string }>;
};

export class MemoryMultipartStorage {
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

  completeMultipartUpload(uploadId: string, parts: MultipartPart[]): void {
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
  }

  abortMultipartUpload(uploadId: string): void {
    this.#uploads.delete(uploadId);
  }

  get(key: string): Uint8Array | undefined {
    return this.#objects.get(key)?.slice();
  }
}
