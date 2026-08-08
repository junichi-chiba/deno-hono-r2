export type UploadPart = {
  partNumber: number;
  etag: string;
};

export type ObjectInfo = {
  ContentLength: number;
  ContentType?: string;
};

export type StoredObject = ObjectInfo & {
  body: Uint8Array;
};

export type SignedObjectUploadInput = {
  key: string;
  contentType: string;
  expiresInSeconds: number;
};

export type SignedUploadPartInput = {
  key: string;
  uploadId: string;
  partNumber: number;
  expiresInSeconds: number;
};

export interface ObjectStorage {
  readonly isMock: boolean;
  putObject(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<string>;
  getObject(key: string): Promise<StoredObject | undefined>;
  headObject(key: string): Promise<ObjectInfo | undefined>;
  deleteObject(key: string): Promise<void>;
  createMultipartUpload(key: string, contentType: string): Promise<string>;
  uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Uint8Array,
  ): Promise<string>;
  completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: UploadPart[],
  ): Promise<void>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
  createSignedUploadUrl(input: SignedObjectUploadInput): Promise<string>;
  createSignedPartUploadUrl(input: SignedUploadPartInput): Promise<string>;
}
