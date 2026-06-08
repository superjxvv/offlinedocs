import { createHash } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BUNDLE_FORMAT_VERSION, RegistrySchema } from '@offlinedocs/shared';

import type { LibraryWriteInput } from './registry-writer.js';
import { writeRegistry } from './registry-writer.js';

describe('writeRegistry', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `registry-writer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  function makeLibInput(overrides?: Partial<LibraryWriteInput>): LibraryWriteInput {
    return {
      config: {
        id: 'react',
        name: 'React',
        sourceType: 'llms-txt',
        sourceUrl: 'https://example.com/react.md',
      },
      fetchResult: {
        chunks: [
          { content: 'raw chunk 1', title: 'Getting Started' },
          { content: 'raw chunk 2', title: 'Hooks' },
        ],
        metadata: { version: '19.0.0', fetchedAt: '2026-05-26T12:00:00.000Z' },
      },
      processedChunks: [
        { filename: 'getting-started.md', content: 'processed 1', frontmatter: { title: 'Getting Started', library: 'react', topics: ['intro'] } },
        { filename: 'hooks.md', content: 'processed 2', frontmatter: { title: 'Hooks', library: 'react', topics: ['hooks'] } },
      ],
      checksums: {
        'react/getting-started.md': 'abc123',
        'react/hooks.md': 'def456',
      },
      ...overrides,
    };
  }

  it('writes valid registry.json that passes RegistrySchema validation', async () => {
    await writeRegistry(testDir, [makeLibInput()]);

    const raw = await readFile(path.join(testDir, 'registry.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    const result = RegistrySchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('sets bundleFormatVersion from constant', async () => {
    await writeRegistry(testDir, [makeLibInput()]);

    const parsed = JSON.parse(await readFile(path.join(testDir, 'registry.json'), 'utf-8'));
    expect(parsed.bundleFormatVersion).toBe(BUNDLE_FORMAT_VERSION);
  });

  it('computes fileCount as sum of all chunkCounts', async () => {
    const lib1 = makeLibInput();
    const lib2 = makeLibInput({
      config: { id: 'vue', name: 'Vue', sourceType: 'github', sourceUrl: 'https://github.com/vuejs/core' },
      processedChunks: [
        { filename: 'intro.md', content: 'vue intro', frontmatter: { title: 'Intro', library: 'vue', topics: ['intro'] } },
      ],
      checksums: { 'vue/intro.md': 'ghi789' },
    });

    await writeRegistry(testDir, [lib1, lib2]);

    const parsed = JSON.parse(await readFile(path.join(testDir, 'registry.json'), 'utf-8'));
    expect(parsed.fileCount).toBe(3); // 2 + 1
  });

  it('generates ISO 8601 UTC generatedAt timestamp', async () => {
    await writeRegistry(testDir, [makeLibInput()]);

    const parsed = JSON.parse(await readFile(path.join(testDir, 'registry.json'), 'utf-8'));
    expect(parsed.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('computes contentHash as SHA-256 of concatenated raw chunk content', async () => {
    const lib = makeLibInput();
    await writeRegistry(testDir, [lib]);

    const parsed = JSON.parse(await readFile(path.join(testDir, 'registry.json'), 'utf-8'));
    const rawContent = 'raw chunk 1\0raw chunk 2';
    const expectedHash = createHash('sha256').update(rawContent).digest('hex');
    expect(parsed.libraries[0].contentHash).toBe(expectedHash);
  });

  it('populates library entry fields correctly', async () => {
    await writeRegistry(testDir, [makeLibInput()]);

    const parsed = JSON.parse(await readFile(path.join(testDir, 'registry.json'), 'utf-8'));
    const lib = parsed.libraries[0];
    expect(lib.id).toBe('react');
    expect(lib.name).toBe('React');
    expect(lib.sourceType).toBe('llms-txt');
    expect(lib.sourceUrl).toBe('https://example.com/react.md');
    expect(lib.lastFetched).toBe('2026-05-26T12:00:00.000Z');
    expect(lib.version).toBe('19.0.0');
    expect(lib.chunkCount).toBe(2);
    expect(lib.checksums).toEqual({
      'react/getting-started.md': 'abc123',
      'react/hooks.md': 'def456',
    });
  });

  it('handles library with no version', async () => {
    const lib = makeLibInput({
      fetchResult: {
        chunks: [{ content: 'content', title: 'Title' }],
        metadata: { fetchedAt: '2026-05-26T12:00:00.000Z' },
      },
    });

    await writeRegistry(testDir, [lib]);

    const parsed = JSON.parse(await readFile(path.join(testDir, 'registry.json'), 'utf-8'));
    expect(parsed.libraries[0].version).toBeUndefined();
  });
});
