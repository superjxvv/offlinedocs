import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { BUNDLE_FORMAT_VERSION } from '@offlinedocs/shared';

import { loadRegistry } from './registry-loader.js';

function makeValidRegistry(overrides: Record<string, unknown> = {}) {
  return {
    bundleFormatVersion: BUNDLE_FORMAT_VERSION,
    libraries: [],
    fileCount: 0,
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('loadRegistry', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'reg-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('loads and validates a correct registry.json', async () => {
    await writeFile(
      path.join(tmpDir, 'registry.json'),
      JSON.stringify(makeValidRegistry()),
    );

    const result = await loadRegistry(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.bundleFormatVersion).toBe(BUNDLE_FORMAT_VERSION);
      expect(result.data.libraries).toEqual([]);
    }
  });

  it('returns error when registry.json is missing', async () => {
    const result = await loadRegistry(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('registry.json not found at');
    }
  });

  it('returns error for invalid JSON', async () => {
    await writeFile(path.join(tmpDir, 'registry.json'), '{not valid json');

    const result = await loadRegistry(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('registry.json contains invalid JSON');
    }
  });

  it('returns error for wrong bundleFormatVersion', async () => {
    await writeFile(
      path.join(tmpDir, 'registry.json'),
      JSON.stringify(makeValidRegistry({ bundleFormatVersion: 99 })),
    );

    const result = await loadRegistry(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Expected bundleFormatVersion');
      expect(result.error.message).toContain('99');
    }
  });

  it('returns error for schema validation failure', async () => {
    await writeFile(
      path.join(tmpDir, 'registry.json'),
      JSON.stringify({ bundleFormatVersion: BUNDLE_FORMAT_VERSION, libraries: 'not-an-array' }),
    );

    const result = await loadRegistry(tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('schema validation failed');
    }
  });

  it('loads registry with library entries', async () => {
    const registry = makeValidRegistry({
      libraries: [
        {
          id: 'react',
          name: 'React',
          description: 'A JS library',
          sourceType: 'llms-txt',
          sourceUrl: 'https://example.com/llms.txt',
          lastFetched: new Date().toISOString(),
          contentHash: 'abc123',
          chunkCount: 2,
          checksums: { 'react/hooks.md': 'def456' },
        },
      ],
      fileCount: 1,
    });
    await writeFile(path.join(tmpDir, 'registry.json'), JSON.stringify(registry));

    const result = await loadRegistry(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.libraries).toHaveLength(1);
      expect(result.data.libraries[0]!.id).toBe('react');
    }
  });
});
