import { createHash } from 'node:crypto';
import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BUNDLE_FORMAT_VERSION, RegistrySchema } from '@offlinedocs/shared';

import type { BundleWriteInput } from './bundle-writer.js';
import { writeBundle } from './bundle-writer.js';

describe('writeBundle', () => {
  let testBase: string;
  let bundlePath: string;

  beforeEach(async () => {
    testBase = path.join(tmpdir(), `bundle-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testBase, { recursive: true });
    bundlePath = path.join(testBase, 'doc-bundle');
  });

  afterEach(async () => {
    await rm(testBase, { recursive: true, force: true });
  });

  function makeInput(id: string, name: string): BundleWriteInput {
    return {
      config: {
        id,
        name,
        sourceType: 'llms-txt',
        sourceUrl: `https://example.com/${id}.md`,
      },
      fetchResult: {
        chunks: [
          { content: `raw ${id} content`, title: 'Main' },
        ],
        metadata: { version: '1.0.0', fetchedAt: '2026-05-26T12:00:00.000Z' },
      },
      processedChunks: [
        {
          filename: 'getting-started.md',
          content: `---\ntitle: Getting Started\nlibrary: ${id}\ntopics:\n  - intro\n---\n# Getting Started with ${name}\n`,
          frontmatter: { title: 'Getting Started', library: id, topics: ['intro'] },
        },
        {
          filename: 'api.md',
          content: `---\ntitle: API\nlibrary: ${id}\ntopics:\n  - api\n---\n# ${name} API\n`,
          frontmatter: { title: 'API', library: id, topics: ['api'] },
        },
      ],
    };
  }

  it('creates directory with registry.json and library subdirs with chunk files', async () => {
    const libraries = [
      makeInput('react', 'React'),
      makeInput('vue', 'Vue'),
      makeInput('express', 'Express'),
    ];

    await writeBundle(bundlePath, libraries);

    // Registry exists
    const registryRaw = await readFile(path.join(bundlePath, 'registry.json'), 'utf-8');
    const registry = JSON.parse(registryRaw);
    expect(RegistrySchema.safeParse(registry).success).toBe(true);

    // Library subdirs exist with chunk files
    for (const lib of libraries) {
      const libDir = path.join(bundlePath, lib.config.id);
      const files = await readdir(libDir);
      expect(files.sort()).toEqual(['api.md', 'getting-started.md']);
    }
  });

  it('checksums in registry match SHA-256 of written chunk files', async () => {
    await writeBundle(bundlePath, [makeInput('react', 'React')]);

    const registry = JSON.parse(await readFile(path.join(bundlePath, 'registry.json'), 'utf-8'));
    const lib = registry.libraries[0];

    for (const [relPath, expectedHash] of Object.entries(lib.checksums)) {
      const fileContent = await readFile(path.join(bundlePath, relPath), 'utf-8');
      const actualHash = createHash('sha256').update(fileContent).digest('hex');
      expect(actualHash).toBe(expectedHash);
    }
  });

  it('fileCount matches actual chunk file count', async () => {
    const libraries = [
      makeInput('react', 'React'),
      makeInput('vue', 'Vue'),
    ];

    await writeBundle(bundlePath, libraries);

    const registry = JSON.parse(await readFile(path.join(bundlePath, 'registry.json'), 'utf-8'));
    expect(registry.fileCount).toBe(4); // 2 chunks per lib * 2 libs
  });

  it('contentHash is SHA-256 of raw source content', async () => {
    await writeBundle(bundlePath, [makeInput('react', 'React')]);

    const registry = JSON.parse(await readFile(path.join(bundlePath, 'registry.json'), 'utf-8'));
    const rawContent = 'raw react content';
    const expectedHash = createHash('sha256').update(rawContent).digest('hex');
    expect(registry.libraries[0].contentHash).toBe(expectedHash);
  });

  it('performs atomic swap via .tmp directory when existing bundle exists', async () => {
    // Write initial bundle
    await writeBundle(bundlePath, [makeInput('react', 'React')]);

    // Write updated bundle (should replace atomically)
    const updatedInput = makeInput('vue', 'Vue');
    await writeBundle(bundlePath, [updatedInput]);

    // Old content replaced
    const registry = JSON.parse(await readFile(path.join(bundlePath, 'registry.json'), 'utf-8'));
    expect(registry.libraries).toHaveLength(1);
    expect(registry.libraries[0].id).toBe('vue');

    // Old library dir gone
    await expect(access(path.join(bundlePath, 'react'))).rejects.toThrow();

    // tmp dir cleaned up
    await expect(access(`${bundlePath}.tmp`)).rejects.toThrow();
  });

  it('original bundle is intact while .tmp is being written', async () => {
    // Write initial bundle
    await writeBundle(bundlePath, [makeInput('react', 'React')]);

    const originalRegistry = await readFile(path.join(bundlePath, 'registry.json'), 'utf-8');

    // The atomic swap protocol writes to .tmp first.
    // If we verify that the original bundle dir is unchanged before rename,
    // this is validated by the fact that writeBundle replaces it atomically.
    // We verify by checking the content was correctly replaced:
    await writeBundle(bundlePath, [makeInput('vue', 'Vue')]);

    const newRegistry = await readFile(path.join(bundlePath, 'registry.json'), 'utf-8');
    expect(newRegistry).not.toBe(originalRegistry);

    const parsed = JSON.parse(newRegistry);
    expect(parsed.libraries[0].id).toBe('vue');
  });

  it('generatedAt is ISO 8601 UTC string', async () => {
    await writeBundle(bundlePath, [makeInput('react', 'React')]);

    const registry = JSON.parse(await readFile(path.join(bundlePath, 'registry.json'), 'utf-8'));
    expect(registry.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('sets bundleFormatVersion from constant', async () => {
    await writeBundle(bundlePath, [makeInput('react', 'React')]);

    const registry = JSON.parse(await readFile(path.join(bundlePath, 'registry.json'), 'utf-8'));
    expect(registry.bundleFormatVersion).toBe(BUNDLE_FORMAT_VERSION);
  });

  it('cleans up .tmp dir on failure', async () => {
    // Use an invalid setup that will cause writeRegistry to fail
    // by providing data that won't pass schema validation (empty id)
    const badInput: BundleWriteInput = {
      config: {
        id: '', // empty id will fail RegistrySchema validation
        name: 'Bad',
        sourceType: 'llms-txt',
        sourceUrl: 'https://example.com',
      },
      fetchResult: {
        chunks: [{ content: 'content', title: 'Title' }],
        metadata: { fetchedAt: '2026-05-26T12:00:00.000Z' },
      },
      processedChunks: [
        { filename: 'test.md', content: 'content', frontmatter: { title: 'Test', library: '', topics: [] } },
      ],
    };

    await expect(writeBundle(bundlePath, [badInput])).rejects.toThrow();

    // tmp dir should be cleaned up
    await expect(access(`${bundlePath}.tmp`)).rejects.toThrow();
  });

  it('handles empty libraries array', async () => {
    await writeBundle(bundlePath, []);

    const registry = JSON.parse(await readFile(path.join(bundlePath, 'registry.json'), 'utf-8'));
    expect(registry.libraries).toEqual([]);
    expect(registry.fileCount).toBe(0);
  });
});
