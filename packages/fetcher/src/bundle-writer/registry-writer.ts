import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { BUNDLE_FORMAT_VERSION, RegistrySchema, type Registry, type LibraryConfig } from '@offlinedocs/shared';

import type { FetchResult } from '../adapters/types.js';
import type { ProcessedChunk } from '../chunk-processor/index.js';
import { computeContentHash } from './integrity.js';

export interface LibraryWriteInput {
  config: LibraryConfig;
  fetchResult: FetchResult;
  processedChunks: ProcessedChunk[];
  checksums: Record<string, string>;
}

/**
 * Write registry.json to the bundle directory.
 * Validates output against RegistrySchema before writing.
 */
export async function writeRegistry(
  bundlePath: string,
  libraries: LibraryWriteInput[],
): Promise<void> {
  const registry: Registry = {
    bundleFormatVersion: BUNDLE_FORMAT_VERSION,
    libraries: libraries.map((lib) => {
      const rawContent = lib.fetchResult.chunks.map((c) => c.content).join('\0');
      return {
        id: lib.config.id,
        name: lib.config.name,
        description: '',
        version: lib.fetchResult.metadata.version,
        sourceType: lib.config.sourceType,
        sourceUrl: lib.config.sourceUrl,
        lastFetched: lib.fetchResult.metadata.fetchedAt,
        contentHash: computeContentHash(rawContent),
        chunkCount: lib.processedChunks.length,
        checksums: lib.checksums,
      };
    }),
    fileCount: libraries.reduce((sum, lib) => sum + lib.processedChunks.length, 0),
    generatedAt: new Date().toISOString(),
  };

  // Validate against schema before writing
  RegistrySchema.parse(registry);

  const registryPath = path.join(bundlePath, 'registry.json');
  await writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
}
