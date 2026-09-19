import { afterEach, describe, expect, it, vi } from "vitest";
import { safeFetch } from "../safe-fetch";
import { assertPublicAddress } from "../public-url";

afterEach(() => vi.unstubAllGlobals());

describe("server-side URL validation", () => {
  it.each([
    "http://127.0.0.1/private",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://10.0.0.1/",
    "http://169.254.169.254/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fc00::1]/",
    "http://localhost./",
    "http://server.internal/",
    "http://server/",
    "file:///etc/passwd",
    "https://user:password@example.com/",
  ])("rejects %s before opening a connection", async (url) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(safeFetch(url)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects redirects to private addresses", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/admin" },
        })
    );
    vi.stubGlobal("fetch", fetch);
    await expect(safeFetch("https://example.com/feed")).rejects.toThrow(
      /private|reserved/
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("follows public redirects manually and removes credentials", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "/rss" } })
      )
      .mockResolvedValueOnce(new Response("feed"));
    vi.stubGlobal("fetch", fetch);
    expect(
      await (
        await safeFetch("https://example.com/feed", {
          headers: { authorization: "secret", cookie: "session=secret" },
        })
      ).text()
    ).toBe("feed");
    expect(fetch.mock.lastCall?.[0]).toBe("https://example.com/rss");
    const options: RequestInit = fetch.mock.lastCall![1];
    expect(options.redirect).toBe("manual");
    expect(new Headers(options.headers).has("authorization")).toBe(false);
    expect(new Headers(options.headers).has("cookie")).toBe(false);
  });

  it("shares one timeout budget across every redirect", async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        signals.push(init.signal);
        return signals.length === 1
          ? new Response(null, { status: 302, headers: { location: "/feed" } })
          : new Response("feed");
      })
    );
    await safeFetch("https://example.com");
    expect(signals).toHaveLength(2);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[1]).toBe(signals[0]);
  });

  it("rejects non-public DNS results, including IPv4 mapped IPv6", () => {
    for (const address of [
      "127.0.0.1",
      "192.168.1.1",
      "::ffff:10.0.0.1",
      "100.64.0.1",
      "fe80::1",
    ])
      expect(() => assertPublicAddress(address)).toThrow();
    expect(() => assertPublicAddress("93.184.216.34")).not.toThrow();
    expect(() => assertPublicAddress("2606:4700:4700::1111")).not.toThrow();
  });
});
