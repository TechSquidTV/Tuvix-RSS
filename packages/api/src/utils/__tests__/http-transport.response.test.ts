import { expect, it, vi } from "vitest";
import { Response as UndiciResponse } from "undici";
import { fetchPublicUrl } from "../http-transport.node";

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn<typeof import("undici").fetch>(),
}));

vi.mock("undici", async (importOriginal) => ({
  ...(await importOriginal<typeof import("undici")>()),
  fetch: mockFetch,
}));

it("returns a native streaming response with the URL needed by discovery", async () => {
  const upstream = new UndiciResponse("<rss>feed</rss>", {
    headers: { "content-type": "application/rss+xml" },
  });
  Object.defineProperty(upstream, "url", { value: "https://example.com/feed" });
  mockFetch.mockResolvedValue(upstream);

  const response = await fetchPublicUrl("https://example.com/feed", {
    headers: { "user-agent": "TuvixRSS" },
  });

  expect(response).toBeInstanceOf(Response);
  expect(response.url).toBe("https://example.com/feed");
  expect(response.headers.get("content-type")).toBe("application/rss+xml");
  expect(await response.text()).toBe("<rss>feed</rss>");
  expect(mockFetch).toHaveBeenCalledWith(
    "https://example.com/feed",
    expect.objectContaining({
      redirect: "manual",
      headers: expect.arrayContaining([["user-agent", "TuvixRSS"]]),
    })
  );
});
