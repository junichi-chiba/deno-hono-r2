import type { ObjectMetadata } from "./object.ts";
import type { ObjectMetadataStore } from "./ports.ts";

// Completion can race across requests. Serializing a digest's claim keeps the
// first completed content record active within a process.
const digestClaims = new Map<string, Promise<void>>();

export type CompletedContentInput =
  & Omit<
    ObjectMetadata,
    "status" | "duplicateOf"
  >
  & Partial<Pick<ObjectMetadata, "status" | "duplicateOf">>;

export async function saveCompletedContent(
  store: ObjectMetadataStore,
  metadata: CompletedContentInput,
): Promise<ObjectMetadata> {
  const digest = metadata.contentDigest.toLowerCase();
  const previous = digestClaims.get(digest) ?? Promise.resolve();
  let release!: () => void;
  const current = previous.then(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  digestClaims.set(digest, current);
  await previous;

  try {
    const existing = await store.findByDigest(digest);
    if (existing && existing.key !== metadata.key) {
      const duplicate = {
        ...metadata,
        contentDigest: digest,
        status: "duplicate" as const,
        duplicateOf: existing.key,
      };
      await store.save(duplicate);
      return duplicate;
    }

    const active = {
      ...metadata,
      contentDigest: digest,
      status: "active" as const,
    };
    await store.save(active);
    return active;
  } finally {
    release();
    if (digestClaims.get(digest) === current) digestClaims.delete(digest);
  }
}
