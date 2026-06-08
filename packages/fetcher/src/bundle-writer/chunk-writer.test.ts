import { createHash } from 'node:crypto';
import { readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ProcessedChunk } from '../chunk-processor/index.js';
import { writeChunks } from './chunk-writer.js';

describe('writeChunks', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `chunk-writer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  const makeChunk = (filename: string, content: string): ProcessedChunk => ({
    filename,
    content,
    frontmatter: { title: 'Test', library: 'test-lib', topics: ['test'] },
  });

  it('creates library subdirectory and writes chunk files', async () => {
    const chunks: ProcessedChunk[] = [
      makeChunk('getting-started.md', '---\ntitle: Getting Started\n---\nContent here'),
      makeChunk('hooks.md', '---\ntitle: Hooks\n---\nHooks content'),
    ];

    await writeChunks(testDir, 'react', chunks);

    const libDir = path.join(testDir, 'react');
    const files = await readdir(libDir);
    expect(files.sort()).toEqual(['getting-started.md', 'hooks.md']);
  });

  it('returns checksums keyed by forward-slash relative path', async () => {
    const chunks: ProcessedChunk[] = [
      makeChunk('api.md', 'API content'),
    ];

    const result = await writeChunks(testDir, 'express', chunks);

    expect(result.checksums).toHaveProperty('express/api.md');
    expect(Object.keys(result.checksums)).toHaveLength(1);
  });

  it('checksums match SHA-256 of written file content', async () => {
    const content = '---\ntitle: Test\n---\nSome documentation';
    const chunks: ProcessedChunk[] = [makeChunk('test.md', content)];

    const result = await writeChunks(testDir, 'mylib', chunks);

    const writtenContent = await readFile(path.join(testDir, 'mylib', 'test.md'), 'utf-8');
    const expectedHash = createHash('sha256').update(writtenContent).digest('hex');
    expect(result.checksums['mylib/test.md']).toBe(expectedHash);
  });

  it('returns correct chunkCount', async () => {
    const chunks: ProcessedChunk[] = [
      makeChunk('a.md', 'content a'),
      makeChunk('b.md', 'content b'),
      makeChunk('c.md', 'content c'),
    ];

    const result = await writeChunks(testDir, 'lib', chunks);
    expect(result.chunkCount).toBe(3);
  });

  it('handles empty chunks array', async () => {
    const result = await writeChunks(testDir, 'empty-lib', []);
    expect(result.checksums).toEqual({});
    expect(result.chunkCount).toBe(0);
  });
});
