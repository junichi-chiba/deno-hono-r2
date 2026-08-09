import type { ObjectMetadata } from "./object.ts";

export interface ObjectMetadataStore {
  save(metadata: ObjectMetadata): Promise<void>;
  list(): Promise<ObjectMetadata[]>;
  find(key: string): Promise<ObjectMetadata | undefined>;
  findByDigest(contentDigest: string): Promise<ObjectMetadata | undefined>;
  delete(key: string): Promise<void>;
}
