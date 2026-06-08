import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import type { LibraryConfig } from '@offlinedocs/shared';

import type { FetchResult } from '../adapters/types.js';
import type { ProcessedChunk } from '../chunk-processor/index.js';
import { writeChunks } from './chunk-writer.js';
import type { LibraryWriteInput } from './registry-writer.js';
import { writeRegistry } from './registry-writer.js';

export interface BundleWriteInput {
  config: LibraryConfig;
  fetchResult: FetchResult;
  processedChunks: ProcessedChunk[];
}

/**
 * Write a Doc Bundle atomically using temp-dir + rename.
 *
 * Protocol:
 * 1. Write all files to <bundlePath>.tmp/
 * 2. If existing bundle at bundlePath, remove it
 * 3. Rename .tmp to bundlePath
 * 4. On error: clean up .tmp (best-effort)
 */
export async function writeBundle(
  bundlePath: string,
  libraries: BundleWriteInput[],
): Promise<void> {
  const tmpPath = `${bundlePath}.tmp`;

  // Clean up any leftover tmp dir from a previous failed run
  await rm(tmpPath, { recursive: true, force: true });

  // Create temp directory
  await mkdir(tmpPath, { recursive: true });

  try {
    // Write all chunk files and collect checksums
    const libraryInputs: LibraryWriteInput[] = [];

    for (const lib of libraries) {
      const { checksums } = await writeChunks(tmpPath, lib.config.id, lib.processedChunks);

      libraryInputs.push({
        config: lib.config,
        fetchResult: lib.fetchResult,
        processedChunks: lib.processedChunks,
        checksums,
      });
    }

    // Write registry.json
    await writeRegistry(tmpPath, libraryInputs);

    // Atomic swap: remove existing bundle, rename tmp to final
    await rm(bundlePath, { recursive: true, force: true });
    await rename(tmpPath, bundlePath);
  } catch (error) {
    // Best-effort cleanup of tmp dir on failure
    await rm(tmpPath, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
