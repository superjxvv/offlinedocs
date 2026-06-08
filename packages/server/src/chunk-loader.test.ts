import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import type { Registry } from '@offlinedocs/shared';
import { BUNDLE_FORMAT_VERSION } from '@offlinedocs/shared';

import { loadChunks } from './chunk-loader.js';

function makeRegistry(libs: { id: string; chunkCount: number }[]): Registry {
  return {
    bundleFormatVersion: BUNDLE_FORMAT_VERSION,
    libraries: libs.map((l) => ({
      id: l.id,
      name: l.id,
      description: '',
      sourceType: 'llms-txt' as const,
      sourceUrl: 'https://example.com',
      lastFetched: new Date().toISOString(),
      contentHash: 'abc',
      chunkCount: l.chunkCount,
      checksums: {},
    })),
    fileCount: libs.reduce((sum, l) => sum + l.chunkCount, 0),
    generatedAt: new Date().toISOString(),
  };
}

describe('loadChunks', () => {
  let tmpDir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'chunk-test-'));
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    stderrSpy.mockRestore();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('loads chunks with valid frontmatter', async () => {
    const libDir = path.join(tmpDir, 'react');
    await mkdir(libDir, { recursive: true });
    await writeFile(
      path.join(libDir, 'hooks.md'),
      '---\ntitle: React Hooks\nlibrary: react\ntopics:\n  - hooks\n  - state\n---\n# React Hooks\nContent about hooks.',
    );

    const registry = makeRegistry([{ id: 'react', chunkCount: 1 }]);
    const chunks = await loadChunks(tmpDir, registry);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.libraryId).toBe('react');
    expect(chunks[0]!.title).toBe('React Hooks');
    expect(chunks[0]!.topics).toEqual(['hooks', 'state']);
    expect(chunks[0]!.content).toContain('Content about hooks');
    expect(chunks[0]!.byteSize).toBeGreaterThan(0);
    expect(chunks[0]!.filename).toBe('hooks.md');
  });

  it('skips chunks with invalid frontmatter and logs warning to stderr', async () => {
    const libDir = path.join(tmpDir, 'react');
    await mkdir(libDir, { recursive: true });
    // Missing required 'library' field
    await writeFile(
      path.join(libDir, 'bad.md'),
      '---\ntitle: Bad Chunk\n---\n# Bad\nContent.',
    );

    const registry = makeRegistry([{ id: 'react', chunkCount: 1 }]);
    const chunks = await loadChunks(tmpDir, registry);

    expect(chunks).toHaveLength(0);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid frontmatter in react/bad.md'),
    );
  });

  it('skips files without .md extension', async () => {
    const libDir = path.join(tmpDir, 'react');
    await mkdir(libDir, { recursive: true });
    await writeFile(path.join(libDir, 'readme.txt'), 'not a chunk');
    await writeFile(
      path.join(libDir, 'hooks.md'),
      '---\ntitle: Hooks\nlibrary: react\ntopics: []\n---\n# Hooks\nContent.',
    );

    const registry = makeRegistry([{ id: 'react', chunkCount: 2 }]);
    const chunks = await loadChunks(tmpDir, registry);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.filename).toBe('hooks.md');
  });

  it('continues loading when a library directory is missing', async () => {
    const libDir = path.join(tmpDir, 'vue');
    await mkdir(libDir, { recursive: true });
    await writeFile(
      path.join(libDir, 'router.md'),
      '---\ntitle: Router\nlibrary: vue\ntopics: []\n---\n# Router\nContent.',
    );

    const registry = makeRegistry([
      { id: 'nonexistent', chunkCount: 1 },
      { id: 'vue', chunkCount: 1 },
    ]);
    const chunks = await loadChunks(tmpDir, registry);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.libraryId).toBe('vue');
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cannot read library directory nonexistent'),
    );
  });

  it('handles chunks without frontmatter and logs warning', async () => {
    const libDir = path.join(tmpDir, 'react');
    await mkdir(libDir, { recursive: true });
    await writeFile(
      path.join(libDir, 'no-frontmatter.md'),
      '# No Frontmatter\nJust plain markdown.',
    );

    const registry = makeRegistry([{ id: 'react', chunkCount: 1 }]);
    const chunks = await loadChunks(tmpDir, registry);

    expect(chunks).toHaveLength(0);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid frontmatter'),
    );
  });

  it('skips chunks with unparseable YAML frontmatter and logs warning', async () => {
    const libDir = path.join(tmpDir, 'react');
    await mkdir(libDir, { recursive: true });
    await writeFile(
      path.join(libDir, 'malformed.md'),
      '---\n: : :\ninvalid yaml {{{\n---\n# Content',
    );

    const registry = makeRegistry([{ id: 'react', chunkCount: 1 }]);
    const chunks = await loadChunks(tmpDir, registry);

    expect(chunks).toHaveLength(0);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cannot parse frontmatter in react/malformed.md'),
    );
  });

  it('loads chunks from multiple libraries', async () => {
    for (const lib of ['react', 'vue']) {
      const libDir = path.join(tmpDir, lib);
      await mkdir(libDir, { recursive: true });
      await writeFile(
        path.join(libDir, 'intro.md'),
        `---\ntitle: Intro\nlibrary: ${lib}\ntopics: []\n---\n# Intro\nContent for ${lib}.`,
      );
    }

    const registry = makeRegistry([
      { id: 'react', chunkCount: 1 },
      { id: 'vue', chunkCount: 1 },
    ]);
    const chunks = await loadChunks(tmpDir, registry);

    expect(chunks).toHaveLength(2);
    expect(chunks.map((c) => c.libraryId)).toEqual(['react', 'vue']);
  });
});
