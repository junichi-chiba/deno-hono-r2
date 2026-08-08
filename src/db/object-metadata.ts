import type { ObjectMetadata } from "../domain/object.ts";
export type { ObjectMetadata } from "../domain/object.ts";

export interface ObjectMetadataStore {
  save(metadata: ObjectMetadata): Promise<void>;
  find(key: string): Promise<ObjectMetadata | undefined>;
  delete(key: string): Promise<void>;
}
