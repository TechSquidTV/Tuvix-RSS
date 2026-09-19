import { expect, it, vi } from "vitest";
import type { LookupAddress } from "node:dns";

vi.mock("node:dns", () => ({
  lookup: vi.fn(
    (
      _hostname: string,
      _options: object,
      callback: (error: Error | null, addresses: LookupAddress[]) => void
    ) => {
      callback(null, [{ address: "127.0.0.1", family: 4 }]);
    }
  ),
}));

it("rejects a private DNS answer in the connection lookup", async () => {
  const { fetchPublicUrl } = await import("../http-transport.node");
  await expect(
    fetchPublicUrl("http://rebind.example/feed", {})
  ).rejects.toMatchObject({
    cause: {
      message:
        "Requests to private or reserved network addresses are not allowed",
    },
  });
});
