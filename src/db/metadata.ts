import { z } from "zod";

const metadataPath = "tmp/db/metadata/objects.json";

const ObjectMetadataSchema = z.object({
  key: z.string().min(1),
  size: z.number().int().nonnegative(),
  contentType: z.string().min(1),
  etag: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type ObjectMetadata = z.infer<typeof ObjectMetadataSchema>;

const MetadataIndexSchema = z.record(z.string(), ObjectMetadataSchema);

async function readIndex(): Promise<Record<string, ObjectMetadata>> {
  try {
    const text = await Deno.readTextFile(metadataPath);
    return MetadataIndexSchema.parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return {};
    throw error;
  }
}

async function writeIndex(
  index: Record<string, ObjectMetadata>,
): Promise<void> {
  await Deno.mkdir("tmp/db/metadata", { recursive: true });
  await Deno.writeTextFile(metadataPath, `${JSON.stringify(index, null, 2)}\n`);
}

export async function saveObjectMetadata(
  metadata: ObjectMetadata,
): Promise<void> {
  const index = await readIndex();
  index[metadata.key] = ObjectMetadataSchema.parse(metadata);
  await writeIndex(index);
}

export async function findObjectMetadata(
  key: string,
): Promise<ObjectMetadata | undefined> {
  const index = await readIndex();
  return index[key];
}

export async function deleteObjectMetadata(key: string): Promise<void> {
  const index = await readIndex();
  delete index[key];
  await writeIndex(index);
}
