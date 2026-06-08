import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import type { Registry } from '@offlinedocs/shared';
import { BUNDLE_FORMAT_VERSION } from '@offlinedocs/shared';

import { validateBundleStartup } from './bundle-validator.js';

function makeChunkContent(title: string, libraryId: string): string {
  return `---\ntitle: ${title}\nlibrary: ${libraryId}\ntopics: []\n---\n# ${title}\nContent here.`;
}

function checksumOf(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function createTestBundle(
  tmpDir: string,
  libs: { id: string; chunks: { name: string; content: string }[] }[],
): Promise<Registry> {
  const libraries = [];
  let totalFiles = 0;

  for (const lib of libs) {
    const libDir = path.join(tmpDir, lib.id);
    await mkdir(libDir, { recursive: true });
    const checksums: Record<string, string> = {};

    for (const chunk of lib.chunks) {
      const filePath = path.join(libDir, chunk.name);
      await writeFile(filePath, chunk.content);
      checksums[`${lib.id}/${chunk.name}`] = checksumOf(chunk.content);
      totalFiles++;
    }

    libraries.push({
      id: lib.id,
      name: lib.id,
      description: '',
      sourceType: 'llms-txt' as const,
      sourceUrl: 'https://example.com',
      lastFetched: new Date().toISOString(),
      contentHash: 'abc',
      chunkCount: lib.chunks.length,
      checksums,
    });
  }

  return {
    bundleFormatVersion: BUNDLE_FORMAT_VERSION,
    libraries,
    fileCount: totalFiles,
    generatedAt: new Date().toISOString(),
  };
}

describe('validateBundleStartup', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'bval-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('passes validation for a correct bundle', async () => {
    const content = makeChunkContent('Hooks', 'react');
    const registry = await createTestBundle(tmpDir, [
      { id: 'react', chunks: [{ name: 'hooks.md', content }] },
    ]);

    const result = await validateBundleStartup(tmpDir, registry);
    expect(result.ok).toBe(true);
  });

  it('reports file count mismatch', async () => {
    const content = makeChunkContent('Hooks', 'react');
    const registry = await createTestBundle(tmpDir, [
      { id: 'react', chunks: [{ name: 'hooks.md', content }] },
    ]);
    registry.fileCount = 20; // Wrong count

    const result = await validateBundleStartup(tmpDir, registry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('File count mismatch');
      expect(result.error.message).toContain('20');
      expect(result.error.message).toContain('1');
    }
  });

  it('reports checksum mismatch', async () => {
    const content = makeChunkContent('Hooks', 'react');
    const registry = await createTestBundle(tmpDir, [
      { id: 'react', chunks: [{ name: 'hooks.md', content }] },
    ]);
    // Tamper with the file after creating the registry
    await writeFile(path.join(tmpDir, 'react', 'hooks.md'), 'tampered content');

    const result = await validateBundleStartup(tmpDir, registry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Checksum mismatch');
    }
  });

  it('skips checksum verification with skipIntegrity', async () => {
    const content = makeChunkContent('Hooks', 'react');
    const registry = await createTestBundle(tmpDir, [
      { id: 'react', chunks: [{ name: 'hooks.md', content }] },
    ]);
    // Tamper with file
    await writeFile(path.join(tmpDir, 'react', 'hooks.md'), 'tampered content');

    const result = await validateBundleStartup(tmpDir, registry, { skipIntegrity: true });
    expect(result.ok).toBe(true); // Passes because checksums not verified
  });

  it('reports missing library directory', async () => {
    const registry: Registry = {
      bundleFormatVersion: BUNDLE_FORMAT_VERSION,
      libraries: [{
        id: 'nonexistent',
        name: 'Nonexistent',
        description: '',
        sourceType: 'llms-txt',
        sourceUrl: 'https://example.com',
        lastFetched: new Date().toISOString(),
        contentHash: 'abc',
        chunkCount: 1,
        checksums: {},
      }],
      fileCount: 1,
      generatedAt: new Date().toISOString(),
    };

    const result = await validateBundleStartup(tmpDir, registry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Library directory missing');
    }
  });

  it('handles multiple libraries correctly', async () => {
    const content1 = makeChunkContent('Hooks', 'react');
    const content2 = makeChunkContent('Router', 'vue');
    const registry = await createTestBundle(tmpDir, [
      { id: 'react', chunks: [{ name: 'hooks.md', content: content1 }] },
      { id: 'vue', chunks: [{ name: 'router.md', content: content2 }] },
    ]);

    const result = await validateBundleStartup(tmpDir, registry);
    expect(result.ok).toBe(true);
  });
});
