export async function safeRpcCall<T>(
  fn: () => Promise<T>,
  toast: (message: string, type: string) => void,
  label: string
): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error(`${label} failed:`, e);
    toast(`${label} failed`, "error");
    return null;
  }
}
