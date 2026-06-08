import { describe, it, expect, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { validateBundle, normalizeBundlePath } from './bundle-validator.js';

const tmpDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('cross-platform integrity', () => {
  it('SHA-256 produces identical hashes for identical content', () => {
    const content = 'Hello, World! This is a test chunk.\n';
    const hash1 = createHash('sha256').update(content).digest('hex');
    const hash2 = createHash('sha256').update(content).digest('hex');
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('SHA-256 is content-based, not path-based', () => {
    const content = '# React Hooks\n\nHooks let you use state in function components.\n';
    const hash = createHash('sha256').update(content).digest('hex');
    // Same content, different conceptual paths — hash is identical
    expect(hash).toBe(
      createHash('sha256').update(content).digest('hex'),
    );
  });

  it('registry checksum keys use forward-slash paths', () => {
    // Simulate a checksum map as stored in registry.json
    const checksums: Record<string, string> = {
      'react/hooks.md': 'abc123',
      'react/getting-started.md': 'def456',
    };
    for (const key of Object.keys(checksums)) {
      expect(key).not.toContain('\\');
      expect(key).toBe(normalizeBundlePath(key));
    }
  });

  it('registry round-trip preserves integrity', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'integrity-'));
    tmpDirs.push(tmpDir);
    const bundlePath = tmpDir;

    // Create a minimal valid bundle
    const chunkContent = '---\ntitle: Hooks\nlibrary: react\ntopics:\n  - hooks\n---\n# Hooks\n\nContent here.\n';
    const chunkHash = createHash('sha256').update(chunkContent).digest('hex');

    const registry = {
      bundleFormatVersion: 1,
      libraries: [
        {
          id: 'react',
          name: 'React',
          description: 'A JavaScript library',
          sourceType: 'llms-txt',
          sourceUrl: 'https://example.com',
          lastFetched: '2026-05-01T00:00:00.000Z',
          contentHash: 'abc',
          chunkCount: 1,
          checksums: {
            'react/hooks.md': chunkHash,
          },
        },
      ],
      fileCount: 1,
      generatedAt: '2026-05-01T00:00:00.000Z',
    };

    // Write registry and chunk
    await writeFile(
      path.join(bundlePath, 'registry.json'),
      JSON.stringify(registry, null, 2),
    );
    await mkdir(path.join(bundlePath, 'react'), { recursive: true });
    await writeFile(path.join(bundlePath, 'react', 'hooks.md'), chunkContent);

    // Validate bundle — should pass with matching checksums and fileCount
    const result = await validateBundle(bundlePath);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fileCount validation works with normalized paths', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'filecount-'));
    tmpDirs.push(tmpDir);
    const chunkContent = '---\ntitle: Test\nlibrary: lib\ntopics:\n  - test\n---\n# Test\n';
    const chunkHash = createHash('sha256').update(chunkContent).digest('hex');

    const registry = {
      bundleFormatVersion: 1,
      libraries: [
        {
          id: 'lib',
          name: 'Lib',
          description: 'Test lib',
          sourceType: 'llms-txt',
          sourceUrl: 'https://example.com',
          lastFetched: '2026-05-01T00:00:00.000Z',
          contentHash: 'abc',
          chunkCount: 1,
          checksums: {
            'lib/test.md': chunkHash,
          },
        },
      ],
      fileCount: 1,
      generatedAt: '2026-05-01T00:00:00.000Z',
    };

    await writeFile(
      path.join(tmpDir, 'registry.json'),
      JSON.stringify(registry, null, 2),
    );
    await mkdir(path.join(tmpDir, 'lib'), { recursive: true });
    await writeFile(path.join(tmpDir, 'lib', 'test.md'), chunkContent);

    const result = await validateBundle(tmpDir);
    expect(result.valid).toBe(true);

    // Wrong fileCount should fail
    registry.fileCount = 5;
    await writeFile(
      path.join(tmpDir, 'registry.json'),
      JSON.stringify(registry, null, 2),
    );
    const result2 = await validateBundle(tmpDir);
    expect(result2.valid).toBe(false);
    expect(result2.errors.some((e) => e.includes('File count mismatch'))).toBe(true);
  });
});
