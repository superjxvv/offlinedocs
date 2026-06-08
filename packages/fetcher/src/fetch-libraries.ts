import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import matter from '@11ty/gray-matter';

import type { LibraryConfig, Registry, Result, Frontmatter } from '@offlinedocs/shared';
import { AdapterError, FrontmatterSchema, RegistrySchema } from '@offlinedocs/shared';

import type { SourceAdapter, FetchResult } from './adapters/types.js';
import { LlmsTxtAdapter } from './adapters/llms-txt-adapter.js';
import { GitHubAdapter } from './adapters/github-adapter.js';
import { Context7Adapter } from './adapters/context7-adapter.js';
import { processChunks } from './chunk-processor/index.js';
import type { ProcessedChunk } from './chunk-processor/index.js';
import { writeBundle } from './bundle-writer/bundle-writer.js';
import type { BundleWriteInput } from './bundle-writer/bundle-writer.js';
import { computeContentHash } from './bundle-writer/integrity.js';
import {
  reportStart,
  reportDone,
  reportFailed,
  reportSkipped,
  reportSummary,
} from './progress.js';

export interface FetchOptions {
  bundlePath: string;
  force?: boolean;
}

export interface FetchLibrariesResult {
  fetched: number;
  failed: number;
  skipped: number;
  errors: AdapterError[];
}

function getAdapter(sourceType: string): SourceAdapter | null {
  switch (sourceType) {
    case 'llms-txt':
      return new LlmsTxtAdapter();
    case 'github':
      return new GitHubAdapter();
    case 'context7':
      return new Context7Adapter();
    default:
      return null;
  }
}

async function loadExistingRegistry(bundlePath: string): Promise<Registry | null> {
  try {
    const content = await readFile(path.join(bundlePath, 'registry.json'), 'utf-8');
    const parsed = JSON.parse(content);
    return RegistrySchema.parse(parsed);
  } catch (error) {
    // File not found is expected on first run — only warn for other errors
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    console.warn(`Warning: failed to load existing registry at ${bundlePath}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function preserveLibrary(
  bundlePath: string,
  libraryId: string,
  registry: Registry,
): Promise<BundleWriteInput | null> {
  const entry = registry.libraries.find((l) => l.id === libraryId);
  if (!entry) return null;

  const libDir = path.join(bundlePath, libraryId);
  let files: string[];
  try {
    files = await readdir(libDir);
  } catch {
    return null;
  }

  const chunks: ProcessedChunk[] = [];
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const content = await readFile(path.join(libDir, file), 'utf-8');
    const parsed = matter(content);
    const fmResult = FrontmatterSchema.safeParse(parsed.data);
    const frontmatter: Frontmatter = fmResult.success
      ? fmResult.data
      : { title: file.replace('.md', ''), library: libraryId, topics: [] };
    chunks.push({ filename: file, content, frontmatter });
  }

  const config: LibraryConfig = {
    id: entry.id,
    name: entry.name,
    sourceType: entry.sourceType,
    sourceUrl: entry.sourceUrl,
  };

  const fetchResult: FetchResult = {
    chunks: chunks.map((c) => ({ content: c.content, title: c.frontmatter.title })),
    metadata: { fetchedAt: entry.lastFetched, version: entry.version },
  };

  return { config, fetchResult, processedChunks: chunks };
}

export async function fetchLibraries(
  configs: LibraryConfig[],
  options: FetchOptions,
): Promise<FetchLibrariesResult> {
  const startTime = Date.now();
  const total = configs.length;
  let fetched = 0;
  let failed = 0;
  let skipped = 0;
  const errors: AdapterError[] = [];
  const bundleInputs: BundleWriteInput[] = [];

  // Load existing registry for incremental skip
  const existingRegistry = await loadExistingRegistry(options.bundlePath);
  const existingHashMap = new Map<string, string>();
  if (existingRegistry) {
    for (const lib of existingRegistry.libraries) {
      existingHashMap.set(lib.id, lib.contentHash);
    }
  }

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i]!;
    const index = i + 1;
    const adapter = getAdapter(config.sourceType);

    reportStart(index, total, config.id);

    if (!adapter) {
      const adapterErr = new AdapterError('CONFIG_INVALID', config.id, `Unknown sourceType: ${config.sourceType}`);
      reportFailed(index, total, config.id, adapterErr.code);
      errors.push(adapterErr);
      failed++;
      continue;
    }

    const result: Result<FetchResult> = await adapter.fetch(config);

    if (!result.ok) {
      reportFailed(index, total, config.id, result.error.code);
      errors.push(result.error);
      failed++;
      continue;
    }

    // Compute content hash of raw fetched content
    const rawContent = result.data.chunks.map((c) => c.content).join('\0');
    const contentHash = computeContentHash(rawContent);

    // Incremental skip: check if content unchanged
    if (!options.force && existingHashMap.get(config.id) === contentHash) {
      const preserved = await preserveLibrary(options.bundlePath, config.id, existingRegistry!);
      if (preserved) {
        bundleInputs.push(preserved);
        reportSkipped(index, total, config.id);
        skipped++;
        continue;
      }
    }

    // Process chunks
    const processedChunks = processChunks(config.id, result.data.chunks);

    bundleInputs.push({
      config,
      fetchResult: result.data,
      processedChunks,
    });

    reportDone(index, total, config.id, processedChunks.length);
    fetched++;
  }

  // Write the bundle (all fetched + preserved)
  if (bundleInputs.length > 0) {
    await writeBundle(options.bundlePath, bundleInputs);
  }

  const durationMs = Date.now() - startTime;
  reportSummary(fetched, failed, skipped, durationMs);

  return { fetched, failed, skipped, errors };
}
