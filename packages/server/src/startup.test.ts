import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { BUNDLE_FORMAT_VERSION } from '@offlinedocs/shared';

import { startupBundle } from './startup.js';

function checksumOf(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function createValidBundle(tmpDir: string) {
  const chunk1 = '---\ntitle: Hooks\nlibrary: react\ntopics:\n  - hooks\n---\n# Hooks\nReact hooks content.';
  const chunk2 = '---\ntitle: Router\nlibrary: vue\ntopics:\n  - router\n---\n# Router\nVue router content.';

  await mkdir(path.join(tmpDir, 'react'), { recursive: true });
  await mkdir(path.join(tmpDir, 'vue'), { recursive: true });
  await writeFile(path.join(tmpDir, 'react', 'hooks.md'), chunk1);
  await writeFile(path.join(tmpDir, 'vue', 'router.md'), chunk2);

  const registry = {
    bundleFormatVersion: BUNDLE_FORMAT_VERSION,
    libraries: [
      {
        id: 'react',
        name: 'React',
        description: '',
        sourceType: 'llms-txt',
        sourceUrl: 'https://example.com',
        lastFetched: new Date().toISOString(),
        contentHash: 'abc',
        chunkCount: 1,
        checksums: { 'react/hooks.md': checksumOf(chunk1) },
      },
      {
        id: 'vue',
        name: 'Vue',
        description: '',
        sourceType: 'llms-txt',
        sourceUrl: 'https://example.com',
        lastFetched: new Date().toISOString(),
        contentHash: 'def',
        chunkCount: 1,
        checksums: { 'vue/router.md': checksumOf(chunk2) },
      },
    ],
    fileCount: 2,
    generatedAt: new Date().toISOString(),
  };

  await writeFile(path.join(tmpDir, 'registry.json'), JSON.stringify(registry));
}

describe('startupBundle', () => {
  let tmpDir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'startup-test-'));
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    stderrSpy.mockRestore();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('successfully loads a valid bundle with search index', async () => {
    await createValidBundle(tmpDir);

    const result = await startupBundle(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.registry.libraries).toHaveLength(2);
      expect(result.data.chunks).toHaveLength(2);
      expect(result.data.index).toBeDefined();
      expect(result.data.index.chunks).toHaveLength(2);
      expect(result.data.index.invertedIndex.size).toBeGreaterThan(0);
    }
  });

  it('fails when registry.json is missing', async () => {
    const result = await startupBundle(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('registry.json not found');
    }
  });

  it('fails when file count mismatches', async () => {
    await createValidBundle(tmpDir);
    // Tamper: rewrite registry with wrong fileCount
    const regPath = path.join(tmpDir, 'registry.json');
    const content = JSON.parse(await readFile(regPath, 'utf-8'));
    content.fileCount = 99;
    await writeFile(regPath, JSON.stringify(content));

    const result = await startupBundle(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('File count mismatch');
    }
  });

  it('fails when checksum mismatches', async () => {
    await createValidBundle(tmpDir);
    // Tamper with a chunk file
    await writeFile(path.join(tmpDir, 'react', 'hooks.md'), 'tampered');

    const result = await startupBundle(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Checksum mismatch');
    }
  });

  it('succeeds with skipIntegrity despite tampered files', async () => {
    await createValidBundle(tmpDir);
    await writeFile(path.join(tmpDir, 'react', 'hooks.md'), 'tampered');

    const result = await startupBundle(tmpDir, { skipIntegrity: true });
    // File count still matches (1 file in react dir), but content is tampered
    // The startup should succeed since we skip integrity
    expect(result.ok).toBe(true);
  });

  it('logs bundle summary to stderr', async () => {
    await createValidBundle(tmpDir);

    await startupBundle(tmpDir);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Bundle loaded: 2 libraries, 2 chunks'),
    );
  });

  it('returns loaded chunks with correct structure', async () => {
    await createValidBundle(tmpDir);

    const result = await startupBundle(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const reactChunk = result.data.chunks.find((c) => c.libraryId === 'react');
      expect(reactChunk).toBeDefined();
      expect(reactChunk!.title).toBe('Hooks');
      expect(reactChunk!.topics).toEqual(['hooks']);
      expect(reactChunk!.byteSize).toBeGreaterThan(0);
    }
  });
});
