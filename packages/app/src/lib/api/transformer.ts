/**
 * SuperJSON Transformer for tRPC v11
 *
 * tRPC v11 requires transformers with input/output structure.
 * Must be passed to httpBatchLink directly (not createClient) for proper deserialization.
 *
 * SuperJSON enables proper serialization of:
 * - Date objects (preserved as Date, not ISO strings)
 * - Maps, Sets, and other JS built-ins
 * - Batched request/response bodies
 */
import superjson from "superjson";

type SuperJSONInput = Parameters<typeof superjson.deserialize>[0];

/**
 * Serialize data using SuperJSON
 * Converts JavaScript objects to a format that preserves type information
 */
export function serializeData(data: unknown) {
  return superjson.serialize(data);
}

/**
 * Deserialize data using SuperJSON
 * Restores JavaScript objects from SuperJSON format with proper types
 */
export function deserializeData(data: unknown) {
  return superjson.deserialize(data as SuperJSONInput);
}

/**
 * Transformer configuration for tRPC v11 httpBatchLink
 * Both input (requests) and output (responses) use SuperJSON
 */
export const transformer = {
  input: {
    serialize: serializeData,
    deserialize: deserializeData,
  },
  output: {
    serialize: serializeData,
    deserialize: deserializeData,
  },
};
