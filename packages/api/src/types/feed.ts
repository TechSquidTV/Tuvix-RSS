import type { AnyFeed } from "feedsmith";

/**
 * Feed Type Definitions for TuvixRSS
 *
 * Re-exports feedsmith types for working with RSS, Atom, RDF, JSON Feed, and OPML.
 * Use the modern namespace types for full type safety and access to all feed components.
 */

export type { RssFeed, AtomFeed, RdfFeed, JsonFeed, Opml } from "feedsmith";

/**
 * Feed discovered from a website URL during autodiscovery
 */
export interface DiscoveredFeed {
  url: string;
  title: string;
  description?: string;
  type: "rss" | "atom" | "rdf" | "json";
  /** Platform-specific high-quality icon URL (e.g., iTunes artwork, Reddit community icon) */
  iconUrl?: string;
}

export type ParsedFeed = AnyFeed["feed"];

export type ParsedFeedItem =
  | NonNullable<Extract<ParsedFeed, { items?: object[] }>["items"]>[number]
  | NonNullable<Extract<ParsedFeed, { entries?: object[] }>["entries"]>[number];
