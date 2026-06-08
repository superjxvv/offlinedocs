import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ProcessedChunk } from '../chunk-processor/index.js';
import { computeChecksum } from './integrity.js';

export interface ChunkWriteResult {
  checksums: Record<string, string>;
  chunkCount: number;
}

/**
 * Write processed chunks to disk under {bundlePath}/{libraryId}/.
 * Returns checksums keyed by forward-slash relative path.
 */
export async function writeChunks(
  bundlePath: string,
  libraryId: string,
  chunks: ProcessedChunk[],
): Promise<ChunkWriteResult> {
  const libDir = path.join(bundlePath, libraryId);
  await mkdir(libDir, { recursive: true });

  const checksums: Record<string, string> = {};

  for (const chunk of chunks) {
    const filePath = path.join(libDir, chunk.filename);
    // Defense-in-depth: ensure resolved path stays within libDir
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(libDir) + path.sep) && resolved !== path.resolve(libDir)) {
      throw new Error(`Path traversal detected: ${chunk.filename} resolves outside ${libDir}`);
    }
    await writeFile(filePath, chunk.content, 'utf-8');

    const relativeKey = path.posix.join(libraryId, chunk.filename);
    checksums[relativeKey] = computeChecksum(chunk.content);
  }

  return { checksums, chunkCount: chunks.length };
}
