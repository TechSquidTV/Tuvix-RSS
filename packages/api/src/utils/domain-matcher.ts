/**
 * Domain Matching Utility
 *
 * Helper functions for matching domains and subdomains.
 */

/**
 * Check if a domain is a subdomain of (or equal to) a base domain.
 *
 * @param domain - The domain to check (e.g., "podcasts.apple.com")
 * @param baseDomain - The base domain (e.g., "apple.com")
 * @returns True if domain is a subdomain of or equal to baseDomain
 *
 * @example
 * isSubdomainOf("podcasts.apple.com", "apple.com") // true
 * isSubdomainOf("apple.com", "apple.com") // true
 * isSubdomainOf("example.com", "apple.com") // false
 */
export function isSubdomainOf(domain: string, baseDomain: string): boolean {
  const normalizedDomain = domain.toLowerCase().trim();
  const normalizedBase = baseDomain.toLowerCase().trim();

  // Exact match
  if (normalizedDomain === normalizedBase) {
    return true;
  }

  // Check if domain ends with .baseDomain
  return normalizedDomain.endsWith(`.${normalizedBase}`);
}
