import type { ObjectMetadataStore } from "./ports.ts";

export type CompletedContentInput = {
  key: string;
  uploadId?: string;
  size: number;
  contentType: string;
  contentDigest: string;
  etag: string;
  createdAt: number;
  updatedAt: number;
  retentionUntil?: number;
};

export type CompletedContentResult = {
  metadata: import("./object.ts").ObjectMetadata;
  key: string;
  status: "active" | "duplicate";
  duplicateOf?: string;
};

export async function saveCompletedContent(
  store: ObjectMetadataStore,
  metadata: CompletedContentInput,
): Promise<CompletedContentResult> {
  return await store.resolveCompleted(metadata);
}
