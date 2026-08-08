import type { ObjectMetadata } from "./object.ts";

export interface ObjectMetadataStore {
  save(metadata: ObjectMetadata): Promise<void>;
  find(key: string): Promise<ObjectMetadata | undefined>;
  delete(key: string): Promise<void>;
}
