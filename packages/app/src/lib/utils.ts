import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Resolve public RSS URLs against the API that serves them. */
export function getPublicBaseUrl(): string {
  const origin =
    typeof window === "undefined"
      ? "http://localhost:3001"
      : window.location.origin;
  const apiUrl =
    import.meta.env.VITE_PUBLIC_URL ||
    import.meta.env.VITE_API_URL ||
    "http://localhost:3001/trpc";
  const url = new URL(apiUrl, origin);
  url.pathname = url.pathname.replace(/\/trpc\/?$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

/** Open publisher links without allowing executable URL schemes. */
export function openArticleLink(link: string | null): void {
  if (!link) return;
  try {
    const url = new URL(link);
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    window.open(url.href, "_blank", "noopener,noreferrer");
  } catch {
    // Malformed publisher URLs are not navigable.
  }
}
