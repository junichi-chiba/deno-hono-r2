export const MOCK_STORAGE_DELAY_MS = 1000;

export async function mockStorageDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_STORAGE_DELAY_MS));
}
