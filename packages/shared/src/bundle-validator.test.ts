import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { normalizeBundlePath, validateBundle } from './bundle-validator.js';

describe('normalizeBundlePath', () => {
  it('replaces backslashes with forward slashes', () => {
    expect(normalizeBundlePath('react\\hooks.md')).toBe('react/hooks.md');
  });

  it('leaves forward slashes unchanged', () => {
    expect(normalizeBundlePath('react/hooks.md')).toBe('react/hooks.md');
  });

  it('handles mixed slashes', () => {
    expect(normalizeBundlePath('react\\api/hooks\\deep.md')).toBe(
      'react/api/hooks/deep.md',
    );
  });

  it('handles empty string', () => {
    expect(normalizeBundlePath('')).toBe('');
  });

  it('handles string with no slashes', () => {
    expect(normalizeBundlePath('hooks.md')).toBe('hooks.md');
  });
});

describe('validateBundle', () => {
  let bundlePath: string;

  function sha256(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  async function createValidBundle() {
    const chunkContent = '---\ntitle: Hooks\nlibrary: react\ntopics:\n  - hooks\n---\n# Hooks\n';
    const checksum = sha256(chunkContent);

    await mkdir(path.join(bundlePath, 'react'), { recursive: true });
    await writeFile(path.join(bundlePath, 'react', 'hooks.md'), chunkContent);

    const registry = {
      bundleFormatVersion: 1,
      libraries: [
        {
          id: 'react',
          name: 'React',
          description: 'A JavaScript library for building user interfaces',
          sourceType: 'github',
          sourceUrl: 'https://github.com/facebook/react',
          lastFetched: '2026-05-26T00:00:00.000Z',
          contentHash: 'abc123',
          chunkCount: 1,
          checksums: {
            'react/hooks.md': checksum,
          },
        },
      ],
      fileCount: 1,
      generatedAt: '2026-05-26T00:00:00.000Z',
    };

    await writeFile(
      path.join(bundlePath, 'registry.json'),
      JSON.stringify(registry),
    );

    return { registry, chunkContent, checksum };
  }

  beforeEach(async () => {
    bundlePath = path.join(tmpdir(), `bundle-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(bundlePath, { recursive: true });
  });

  afterEach(async () => {
    await rm(bundlePath, { recursive: true, force: true });
  });

  it('returns valid for a correct bundle', async () => {
    await createValidBundle();

    const result = await validateBundle(bundlePath);

    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('returns invalid when registry.json is missing', async () => {
    const result = await validateBundle(bundlePath);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('registry.json not found');
  });

  it('returns invalid when registry.json has invalid JSON', async () => {
    await writeFile(path.join(bundlePath, 'registry.json'), 'not json');

    const result = await validateBundle(bundlePath);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('invalid JSON');
  });

  it('returns invalid when registry.json fails schema validation', async () => {
    await writeFile(
      path.join(bundlePath, 'registry.json'),
      JSON.stringify({ bad: 'data' }),
    );

    const result = await validateBundle(bundlePath);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('schema validation failed');
  });

  it('returns invalid when file count does not match', async () => {
    await createValidBundle();

    // Add an extra file to create mismatch
    await writeFile(path.join(bundlePath, 'react', 'extra.md'), '# Extra');

    const result = await validateBundle(bundlePath);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('File count mismatch'))).toBe(true);
    expect(result.errors.some((e) => /declares 1 files but found 2/.test(e))).toBe(true);
  });

  it('returns invalid when checksum does not match', async () => {
    const { registry } = await createValidBundle();

    // Overwrite the chunk file with different content
    await writeFile(
      path.join(bundlePath, 'react', 'hooks.md'),
      '# Tampered content',
    );

    // Fix fileCount so only checksum error shows
    registry.fileCount = 1;
    await writeFile(
      path.join(bundlePath, 'registry.json'),
      JSON.stringify(registry),
    );

    const result = await validateBundle(bundlePath);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Checksum mismatch for react/hooks.md'))).toBe(
      true,
    );
  });

  it('rejects path traversal in checksum keys', async () => {
    const chunkContent = '# Hooks\n';
    await mkdir(path.join(bundlePath, 'react'), { recursive: true });
    await writeFile(path.join(bundlePath, 'react', 'hooks.md'), chunkContent);

    const registry = {
      bundleFormatVersion: 1,
      libraries: [
        {
          id: 'react',
          name: 'React',
          description: 'A library',
          sourceType: 'github',
          sourceUrl: 'https://github.com/facebook/react',
          lastFetched: '2026-05-26T00:00:00.000Z',
          contentHash: 'abc123',
          chunkCount: 1,
          checksums: {
            '../../etc/passwd': 'deadbeef',
          },
        },
      ],
      fileCount: 1,
      generatedAt: '2026-05-26T00:00:00.000Z',
    };

    await writeFile(
      path.join(bundlePath, 'registry.json'),
      JSON.stringify(registry),
    );

    const result = await validateBundle(bundlePath);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Path traversal detected'))).toBe(true);
  });

  it('rejects path traversal in library id', async () => {
    const registry = {
      bundleFormatVersion: 1,
      libraries: [
        {
          id: '../../../etc',
          name: 'Evil',
          description: 'Malicious',
          sourceType: 'github',
          sourceUrl: 'https://example.com',
          lastFetched: '2026-05-26T00:00:00.000Z',
          contentHash: 'abc',
          chunkCount: 0,
          checksums: {},
        },
      ],
      fileCount: 0,
      generatedAt: '2026-05-26T00:00:00.000Z',
    };

    await writeFile(
      path.join(bundlePath, 'registry.json'),
      JSON.stringify(registry),
    );

    const result = await validateBundle(bundlePath);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Path traversal detected in library id'))).toBe(
      true,
    );
  });

  it('returns invalid when library directory is missing', async () => {
    const registry = {
      bundleFormatVersion: 1,
      libraries: [
        {
          id: 'missing-lib',
          name: 'Missing',
          description: 'A missing library',
          sourceType: 'github',
          sourceUrl: 'https://example.com',
          lastFetched: '2026-05-26T00:00:00.000Z',
          contentHash: 'abc',
          chunkCount: 0,
          checksums: {},
        },
      ],
      fileCount: 0,
      generatedAt: '2026-05-26T00:00:00.000Z',
    };

    await writeFile(
      path.join(bundlePath, 'registry.json'),
      JSON.stringify(registry),
    );

    const result = await validateBundle(bundlePath);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Library directory missing: missing-lib'))).toBe(
      true,
    );
  });
});
