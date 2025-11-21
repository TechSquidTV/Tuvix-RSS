/**
 * Better Auth React Client
 *
 * Client instance for Better Auth authentication.
 * Used by React components and hooks.
 */

import { createAuthClient } from "better-auth/react";
import { customSessionClient } from "better-auth/client/plugins";
import type { createAuth } from "@tuvix/api";

// Better Auth needs to point to the API server, not the frontend
// VITE_API_URL is like "http://localhost:3001/trpc", so we extract the origin
const viteApiUrl = import.meta.env.VITE_API_URL;
const baseURL = viteApiUrl
  ? new URL(viteApiUrl).origin
  : "http://localhost:3001"; // Default to API server in development

// Debug logging in development
if (import.meta.env.DEV) {
  console.log("🔧 Better Auth Client Configuration:", {
    VITE_API_URL: viteApiUrl,
    baseURL,
    mode: import.meta.env.MODE,
  });
}

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    // Custom session plugin for type inference
    // This ensures TypeScript knows about the banned field we added via customSession
    customSessionClient<ReturnType<typeof createAuth>>(),
  ],
});

export type AuthClient = typeof authClient;
