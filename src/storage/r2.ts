import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
  UploadPartCommand,
} from "s3";
import { getSignedUrl } from "presigner";
import type {
  ObjectInfo,
  ObjectStorage,
  SignedObjectUploadInput,
  SignedUploadPartInput,
  StoredObject,
  UploadPart,
} from "./interfaces.ts";

type R2StorageConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

export class R2ObjectStorage implements ObjectStorage {
  readonly isMock = false;
  readonly #bucketName: string;
  readonly #client: S3Client;

  constructor(config: R2StorageConfig, client: S3Client) {
    this.#bucketName = config.bucketName;
    this.#client = client;
  }

  async putObject(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<string> {
    const result = await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return result.ETag ?? "";
  }

  async getObject(key: string): Promise<StoredObject | undefined> {
    try {
      const result = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucketName, Key: key }),
      );
      if (!result.Body) return undefined;
      return {
        body: await result.Body.transformToByteArray(),
        ContentLength: result.ContentLength ?? 0,
        ContentType: result.ContentType,
      };
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async headObject(key: string): Promise<ObjectInfo | undefined> {
    try {
      const result = await this.#client.send(
        new HeadObjectCommand({ Bucket: this.#bucketName, Key: key }),
      );
      if (result.ContentLength === undefined) return undefined;
      return {
        ContentLength: result.ContentLength,
        ContentType: result.ContentType,
      };
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.#client.send(
      new DeleteObjectCommand({ Bucket: this.#bucketName, Key: key }),
    );
  }

  async createMultipartUpload(
    key: string,
    contentType: string,
  ): Promise<string> {
    const result = await this.#client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.#bucketName,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!result.UploadId) {
      throw new Error("R2 did not return a multipart upload ID");
    }
    return result.UploadId;
  }

  uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Uint8Array,
  ): Promise<string> {
    return this.#client.send(
      new UploadPartCommand({
        Bucket: this.#bucketName,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
      }),
    ).then((result) => result.ETag ?? "");
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: UploadPart[],
  ): Promise<void> {
    await this.completeMultipartUploadForKey(key, uploadId, parts);
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.abortMultipartUploadForKey(key, uploadId);
  }

  async createSignedUploadUrl(input: SignedObjectUploadInput): Promise<string> {
    return await getSignedUrl(
      this.#client,
      new PutObjectCommand({
        Bucket: this.#bucketName,
        Key: input.key,
        ContentType: input.contentType,
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async createSignedPartUploadUrl(
    input: SignedUploadPartInput,
  ): Promise<string> {
    return await getSignedUrl(
      this.#client,
      new UploadPartCommand({
        Bucket: this.#bucketName,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async completeMultipartUploadForKey(
    key: string,
    uploadId: string,
    parts: UploadPart[],
  ): Promise<void> {
    await this.#client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.#bucketName,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((part) => ({
            ETag: part.etag,
            PartNumber: part.partNumber,
          })),
        },
      }),
    );
  }

  async abortMultipartUploadForKey(
    key: string,
    uploadId: string,
  ): Promise<void> {
    await this.#client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.#bucketName,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error &&
    ("$metadata" in error &&
        (error as { $metadata?: { httpStatusCode?: number } })
            .$metadata?.httpStatusCode === 404 ||
      "name" in error && (error as { name?: string }).name === "NotFound");
}
