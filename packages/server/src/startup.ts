import type { Registry, Result } from '@offlinedocs/shared';

import type { LoadedChunk } from './chunk-loader.js';
import { loadChunks } from './chunk-loader.js';
import { loadRegistry } from './registry-loader.js';
import type { SearchIndex } from './search/index.js';
import { buildIndex } from './search/index.js';
import { validateBundleStartup } from './bundle-validator.js';

export interface StartupOptions {
  skipIntegrity?: boolean;
}

export interface StartupResult {
  registry: Registry;
  chunks: LoadedChunk[];
  index: SearchIndex;
}

/**
 * Orchestrate server startup: load registry, validate bundle, load chunks.
 * All diagnostic output goes to stderr (stdout reserved for MCP stdio).
 */
export async function startupBundle(
  bundlePath: string,
  options: StartupOptions = {},
): Promise<Result<StartupResult>> {
  // Step 1: Load and validate registry
  const registryResult = await loadRegistry(bundlePath);
  if (!registryResult.ok) {
    return registryResult;
  }

  const registry = registryResult.data;

  // Step 2: Validate bundle integrity
  const validationResult = await validateBundleStartup(bundlePath, registry, {
    skipIntegrity: options.skipIntegrity,
  });
  if (!validationResult.ok) {
    return validationResult;
  }

  // Step 3: Load all chunks
  const chunks = await loadChunks(bundlePath, registry);

  console.error(
    `Bundle loaded: ${registry.libraries.length} libraries, ${chunks.length} chunks`,
  );

  // Step 4: Build search index
  const index = buildIndex(chunks);

  return { ok: true, data: { registry, chunks, index } };
}
