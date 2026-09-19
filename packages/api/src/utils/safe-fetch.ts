import { fetchPublicUrl } from "@api/utils/http-transport";
import { validatePublicUrl } from "./public-url";

/** Validate every redirect, never forwarding credentials to another origin. */
export async function safeFetch(
  input: string | URL | Request,
  init: RequestInit = {}
): Promise<Response> {
  if (input instanceof Request) throw new Error("Pass a URL to safeFetch");
  if (init.method && init.method !== "GET" && init.method !== "HEAD") {
    throw new Error("Feed requests must use GET or HEAD");
  }
  let url = validatePublicUrl(input);
  const headers = new Headers(init.headers);
  headers.delete("cookie");
  headers.delete("authorization");
  const signal = init.signal ?? AbortSignal.timeout(15_000);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetchPublicUrl(url.href, {
      ...init,
      headers,
      redirect: "manual",
      signal,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) throw new Error("Redirect response has no location");
    url = validatePublicUrl(new URL(location, url));
  }
  throw new Error("Too many redirects");
}
