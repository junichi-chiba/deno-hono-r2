export type MultipartPart = {
  partNumber: number;
  etag: string;
};

export type ObjectHead = {
  ContentLength: number;
  ContentType?: string;
};

export type StoredObject = ObjectHead & {
  body: Uint8Array;
};

export type SignedUploadInput = {
  key: string;
  contentType: string;
  expiresInSeconds: number;
};

export type SignedPartUploadInput = {
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
  headObject(key: string): Promise<ObjectHead | undefined>;
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
    parts: MultipartPart[],
  ): Promise<void>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
  createSignedUploadUrl(input: SignedUploadInput): Promise<string>;
  createSignedPartUploadUrl(input: SignedPartUploadInput): Promise<string>;
}
