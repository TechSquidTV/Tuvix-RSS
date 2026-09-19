import { lookup } from "node:dns";
import { Agent, fetch } from "undici";
import { assertPublicAddress } from "./public-url";

// Validate the addresses supplied to the connection itself, preventing DNS
// rebinding between an earlier validation lookup and the actual connection.
const dispatcher = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
        if (error) return callback(error, "", 4);
        try {
          if (!addresses.length) throw new Error("Hostname has no addresses");
          for (const { address } of addresses) assertPublicAddress(address);
          const first = addresses[0]!;
          if (options.all) callback(null, addresses);
          else callback(null, first.address, first.family);
        } catch (cause) {
          callback(
            cause instanceof Error
              ? cause
              : new Error("Invalid network address"),
            "",
            4
          );
        }
      });
    },
  },
});

export async function fetchPublicUrl(
  url: string,
  init: RequestInit
): Promise<Response> {
  const request = new Request(url, init);
  const response = await fetch(url, {
    method: request.method,
    headers: Array.from(request.headers),
    signal: request.signal,
    redirect: "manual",
    body: request.body ? await request.arrayBuffer() : undefined,
    dispatcher,
  });
  const result = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: Array.from(response.headers),
  });
  // Preserve the final URL used by feed discovery while returning the runtime's
  // native Response and streaming the body without buffering it.
  Object.defineProperty(result, "url", { value: response.url });
  return result;
}
