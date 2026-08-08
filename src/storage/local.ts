const objectDirectory = "tmp/db/objects";

function objectPath(key: string): string {
  const segments = key.split("/");
  if (
    key.startsWith("/") ||
    key.includes("\\") ||
    segments.some((segment) =>
      segment === "" || segment === "." ||
      segment === ".."
    )
  ) {
    throw new Error("Invalid object key");
  }
  return `${objectDirectory}/${segments.join("/")}`;
}

export async function readLocalObject(
  key: string,
): Promise<Uint8Array | undefined> {
  try {
    return await Deno.readFile(objectPath(key));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}

export async function writeLocalObject(
  key: string,
  body: Uint8Array,
): Promise<void> {
  const path = objectPath(key);
  const parent = path.slice(0, path.lastIndexOf("/"));
  await Deno.mkdir(parent, { recursive: true });
  await Deno.writeFile(path, body);
}

export async function deleteLocalObject(key: string): Promise<void> {
  try {
    await Deno.remove(objectPath(key));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
}
