import type { ObjectMetadata } from "./object.ts";
import type {
  CompletedContentInput,
  CompletedContentResult,
} from "./content.ts";

export interface ObjectMetadataStore {
  save(metadata: ObjectMetadata): Promise<void>;
  list(): Promise<ObjectMetadata[]>;
  find(key: string): Promise<ObjectMetadata | undefined>;
  findByDigest(contentDigest: string): Promise<ObjectMetadata | undefined>;
  resolveCompleted(
    content: CompletedContentInput,
  ): Promise<CompletedContentResult>;
  markDeleted(key: string, updatedAt: number): Promise<void>;
  removeDuplicate(contentDigest: string, key: string): Promise<void>;
}
