import { assertEquals, assertThrows } from "@std/assert";
import { MemoryMultipartStorage } from "./memory.ts";

Deno.test({
  name: "merges multipart uploads in part order",
  fn(): void {
    const storage = new MemoryMultipartStorage();
    const uploadId = storage.createMultipartUpload("uploads/example");
    const secondEtag = storage.uploadPart(
      uploadId,
      2,
      new TextEncoder().encode(" world"),
    );
    const firstEtag = storage.uploadPart(
      uploadId,
      1,
      new TextEncoder().encode("hello"),
    );

    storage.completeMultipartUpload(uploadId, [
      { partNumber: 2, etag: secondEtag },
      { partNumber: 1, etag: firstEtag },
    ]);

    assertEquals(
      new TextDecoder().decode(storage.get("uploads/example")),
      "hello world",
    );
  },
});

Deno.test({
  name: "rejects completion with a missing part",
  fn(): void {
    const storage = new MemoryMultipartStorage();
    const uploadId = storage.createMultipartUpload("uploads/example");
    const etag = storage.uploadPart(uploadId, 1, new Uint8Array([1]));

    assertThrows(() =>
      storage.completeMultipartUpload(uploadId, [
        { partNumber: 1, etag },
        { partNumber: 2, etag: "missing" },
      ])
    );
  },
});

Deno.test({
  name: "aborting does not create an object",
  fn(): void {
    const storage = new MemoryMultipartStorage();
    const uploadId = storage.createMultipartUpload("uploads/example");
    storage.uploadPart(uploadId, 1, new Uint8Array([1]));

    storage.abortMultipartUpload(uploadId);

    assertEquals(storage.get("uploads/example"), undefined);
  },
});
