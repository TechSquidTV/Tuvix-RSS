/**
 * HTTP Helper Functions
 *
 * Utilities for HTTP adapters (Express and Cloudflare Workers).
 */

import type { IncomingHttpHeaders } from "http";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { createContext } from "@/trpc/context";
import type { Env } from "@/types";

/**
 * Convert Express headers to Web API Headers object
 *
 * @param headers Express request headers
 * @returns Web API Headers object
 */
export function expressHeadersToWeb(headers: IncomingHttpHeaders): Headers {
  const webHeaders = new Headers();

  Object.entries(headers).forEach(([key, value]) => {
    if (value) {
      // Express headers can be string or string[]
      const headerValue = Array.isArray(value) ? value[0] : value;
      webHeaders.set(key, headerValue);
    }
  });

  return webHeaders;
}

/**
 * Create tRPC context from Express request
 *
 * Convenience function for Express adapter endpoints that need
 * to call tRPC procedures directly (e.g., icon serving, public feeds).
 *
 * @param headers Express request headers
 * @param env Environment variables
 * @returns tRPC context
 *
 * @example
 * const ctx = await createContextFromExpressHeaders(req.headers, env);
 * const xml = await appRouter.createCaller(ctx).feeds.getPublicXml({...});
 */
export async function createContextFromExpressHeaders(
  headers: IncomingHttpHeaders,
  env: Env
) {
  const webHeaders = expressHeadersToWeb(headers);

  return createContext({
    req: { headers: webHeaders } as FetchCreateContextFnOptions["req"],
    resHeaders: {} as FetchCreateContextFnOptions["resHeaders"],
    info: {} as FetchCreateContextFnOptions["info"],
    env,
  });
}

/**
 * Create tRPC context from Cloudflare Request
 *
 * Convenience function for Cloudflare Workers adapter endpoints
 * that need to call tRPC procedures directly.
 *
 * @param request Cloudflare Request object
 * @param env Environment variables
 * @returns tRPC context
 */
export async function createContextFromCloudflareRequest(
  request: Request,
  env: Env
) {
  return createContext({
    req: request,
    resHeaders: {} as FetchCreateContextFnOptions["resHeaders"],
    info: {} as FetchCreateContextFnOptions["info"],
    env,
  });
}
