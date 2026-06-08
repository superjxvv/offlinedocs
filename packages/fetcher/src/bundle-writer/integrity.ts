import { createHash } from 'node:crypto';

/**
 * Compute SHA-256 hex digest of content (for per-file checksums in registry).
 */
export function computeChecksum(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Compute SHA-256 of raw fetched source content (for incremental skip logic).
 * Hashes the concatenation of all raw chunk contents from a FetchResult.
 */
export function computeContentHash(rawContent: string): string {
  return createHash('sha256').update(rawContent).digest('hex');
}
