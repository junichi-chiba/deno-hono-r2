import { assertEquals } from "@std/assert";
import { saveCompletedContent } from "./content.ts";
import { MemoryObjectMetadataStore } from "../db/mock/memory.ts";

const digest =
  "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

function metadata(key: string): {
  key: string;
  size: number;
  contentType: string;
  contentDigest: string;
  etag: string;
  createdAt: number;
  updatedAt: number;
} {
  return {
    key,
    size: 5,
    contentType: "text/plain",
    contentDigest: digest,
    etag: `"${key}"`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

Deno.test({
  name: "concurrent completions retain one active object and one duplicate",
  async fn(): Promise<void> {
    const store = new MemoryObjectMetadataStore();
    const [first, second] = await Promise.all([
      saveCompletedContent(store, {
        ...metadata("uploads/first"),
        uploadId: "first-upload",
        retentionUntil: Date.now() + 1000,
      }),
      saveCompletedContent(store, {
        ...metadata("uploads/second"),
        uploadId: "second-upload",
        retentionUntil: Date.now() + 1000,
      }),
    ]);

    assertEquals(
      [first.status, second.status].sort(),
      ["active", "duplicate"],
    );
    const duplicate = first.status === "duplicate" ? first : second;
    const active = first.status === "active" ? first : second;
    assertEquals(duplicate.duplicateOf, active.key);
  },
});
