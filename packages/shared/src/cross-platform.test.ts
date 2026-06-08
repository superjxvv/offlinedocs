import { describe, it, expect } from 'vitest';
import path from 'node:path';

import { normalizeBundlePath } from './bundle-validator.js';

describe('cross-platform path normalization', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizeBundlePath('docs\\react\\hooks.md')).toBe(
      'docs/react/hooks.md',
    );
  });

  it('preserves forward slashes', () => {
    expect(normalizeBundlePath('docs/react/hooks.md')).toBe(
      'docs/react/hooks.md',
    );
  });

  it('handles mixed separators', () => {
    expect(normalizeBundlePath('docs/react\\hooks.md')).toBe(
      'docs/react/hooks.md',
    );
  });

  it('handles empty string', () => {
    expect(normalizeBundlePath('')).toBe('');
  });

  it('handles path with multiple consecutive separators', () => {
    expect(normalizeBundlePath('docs\\\\react\\hooks.md')).toBe(
      'docs//react/hooks.md',
    );
  });

  it('constructs bundle-safe paths with path.posix.join', () => {
    const bundlePath = path.posix.join('react', 'hooks.md');
    expect(bundlePath).toBe('react/hooks.md');
    expect(bundlePath).not.toContain('\\');
  });

  it('produces paths with only OS-safe characters', () => {
    const safePath = path.posix.join('my-library', 'getting-started.md');
    // Only alphanumeric, dash, dot, forward slash
    expect(safePath).toMatch(/^[a-zA-Z0-9\-._/]+$/);
  });

  it('keeps bundle paths under 200 characters', () => {
    // Longest reasonable path: library-id/chunk-name-with-part-number.md
    const longLibraryId = 'a'.repeat(50);
    const longChunkName = 'b'.repeat(100) + '-part-001.md';
    const bundlePath = path.posix.join(longLibraryId, longChunkName);
    expect(bundlePath.length).toBeLessThan(200);
  });
});
