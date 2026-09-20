import { describe, expect, it, vi } from "vitest";
import { readFeedResponse } from "../read-feed-response.js";

describe("bounded feed reader", () => {
  it("rejects an oversized declared body before reading it", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    await expect(
      readFeedResponse(
        new Response(body, { headers: { "content-length": "100" } }),
        10
      )
    ).rejects.toThrow("maximum response size");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each([{}, { "content-length": "1" }])(
    "enforces streamed bytes even with missing or dishonest length",
    async (headers) => {
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(11));
        },
        cancel,
      });
      await expect(
        readFeedResponse(new Response(body, { headers }), 10)
      ).rejects.toThrow("maximum response size");
      expect(cancel).toHaveBeenCalledOnce();
    }
  );
  it("decodes multi-byte characters across chunks and allows the exact limit", async () => {
    const bytes = new TextEncoder().encode("é😃");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 1));
        controller.enqueue(bytes.slice(1, 4));
        controller.enqueue(bytes.slice(4));
        controller.close();
      },
    });
    expect(await readFeedResponse(new Response(body), bytes.length)).toBe(
      "é😃"
    );
  });
});
