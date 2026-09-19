/** Limit decoded response bytes before allocating/parsing an untrusted feed. */
export const MAX_FEED_BYTES = 5 * 1024 * 1024;

export async function readFeedResponse(
  response: Response,
  maxBytes = MAX_FEED_BYTES
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new Error("Feed exceeds the maximum response size");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const buffer = new Uint8Array(maxBytes);
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (bytes + value.byteLength > maxBytes)
        throw new Error("Feed exceeds the maximum response size");
      buffer.set(value, bytes);
      bytes += value.byteLength;
    }
    return new TextDecoder().decode(buffer.subarray(0, bytes));
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
