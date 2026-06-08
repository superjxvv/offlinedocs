import { describe, it, expect } from 'vitest';

import type { Registry } from '@offlinedocs/shared';

import { resolveLibraryId } from './resolve-library-id.js';
import type { ResolveSuccess, ResolveError } from './resolve-library-id.js';

function makeRegistry(
  libs: Partial<Registry['libraries'][number]>[],
): Registry {
  return {
    bundleFormatVersion: 1,
    fileCount: 0,
    generatedAt: '2026-05-01T00:00:00.000Z',
    libraries: libs.map((lib, i) => ({
      id: lib.id ?? `lib-${i}`,
      name: lib.name ?? `Library ${i}`,
      description: lib.description ?? 'A library',
      sourceType: 'llms-txt' as const,
      sourceUrl: 'https://example.com',
      lastFetched: lib.lastFetched ?? '2026-05-01T00:00:00.000Z',
      contentHash: 'abc123',
      chunkCount: 1,
      checksums: {},
      ...lib,
    })),
  };
}

describe('resolveLibraryId', () => {
  const registry = makeRegistry([
    { id: 'react', name: 'React', description: 'A JavaScript library for building UIs', version: '18.3.1', lastFetched: '2026-05-20T00:00:00.000Z' },
    { id: 'nextjs', name: 'Next.js', description: 'The React Framework', lastFetched: '2026-05-15T00:00:00.000Z' },
    { id: 'vue', name: 'Vue.js', description: 'Progressive JavaScript Framework', lastFetched: '2026-04-01T00:00:00.000Z' },
    { id: 'express', name: 'Express', description: 'Fast, unopinionated web framework', lastFetched: '2026-05-10T00:00:00.000Z' },
  ]);

  it('returns exact match by id', () => {
    const result = resolveLibraryId(registry, 'react') as ResolveSuccess;
    expect(result.id).toBe('react');
    expect(result.name).toBe('React');
    expect(result.description).toBe('A JavaScript library for building UIs');
    expect(result.version).toBe('18.3.1');
    expect(result.lastFetched).toBe('2026-05-20T00:00:00.000Z');
  });

  it('returns exact match by id case-insensitively', () => {
    const result = resolveLibraryId(registry, 'React') as ResolveSuccess;
    expect(result.id).toBe('react');
  });

  it('returns exact match by name case-insensitively', () => {
    const result = resolveLibraryId(registry, 'Next.js') as ResolveSuccess;
    expect(result.id).toBe('nextjs');
    expect(result.name).toBe('Next.js');
  });

  it('returns partial match on id', () => {
    const result = resolveLibraryId(registry, 'next') as ResolveSuccess;
    expect(result.id).toBe('nextjs');
    expect(result.name).toBe('Next.js');
  });

  it('returns partial match on name', () => {
    const result = resolveLibraryId(registry, 'vue') as ResolveSuccess;
    expect(result.id).toBe('vue');
    expect(result.name).toBe('Vue.js');
  });

  it('prefers shortest name when multiple partial matches exist', () => {
    const reg = makeRegistry([
      { id: 'react', name: 'React', description: 'React core' },
      { id: 'react-dom', name: 'React DOM', description: 'React DOM bindings' },
      { id: 'react-native', name: 'React Native', description: 'React Native framework' },
    ]);
    const result = resolveLibraryId(reg, 'react') as ResolveSuccess;
    // Exact id match takes priority
    expect(result.id).toBe('react');
    expect(result.name).toBe('React');
  });

  it('prefers shortest name for partial matches without exact id match', () => {
    const reg = makeRegistry([
      { id: 'my-react-dom', name: 'React DOM', description: 'React DOM bindings' },
      { id: 'my-react-native', name: 'React Native', description: 'React Native framework' },
    ]);
    const result = resolveLibraryId(reg, 'react') as ResolveSuccess;
    expect(result.name).toBe('React DOM');
  });

  it('returns LIBRARY_NOT_FOUND with available libraries when no match', () => {
    const result = resolveLibraryId(registry, 'angular') as ResolveError;
    expect(result.error).toBe('Library not found: angular');
    expect(result.code).toBe('LIBRARY_NOT_FOUND');
    expect(result.availableLibraries).toEqual([
      { id: 'react', name: 'React' },
      { id: 'nextjs', name: 'Next.js' },
      { id: 'vue', name: 'Vue.js' },
      { id: 'express', name: 'Express' },
    ]);
  });

  it('omits version when not present in registry entry', () => {
    const result = resolveLibraryId(registry, 'express') as ResolveSuccess;
    expect(result.id).toBe('express');
    expect(result.version).toBeUndefined();
  });

  it('handles empty registry', () => {
    const emptyRegistry = makeRegistry([]);
    const result = resolveLibraryId(emptyRegistry, 'react') as ResolveError;
    expect(result.code).toBe('LIBRARY_NOT_FOUND');
    expect(result.availableLibraries).toEqual([]);
  });
});
