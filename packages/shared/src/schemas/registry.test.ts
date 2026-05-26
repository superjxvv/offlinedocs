import { describe, it, expect } from 'vitest';
import { RegistrySchema } from './registry.js';

describe('RegistrySchema', () => {
  const validRegistry = {
    bundleFormatVersion: 1,
    libraries: [
      {
        id: 'react',
        name: 'React',
        description: 'A JavaScript library for building user interfaces',
        sourceType: 'github' as const,
        sourceUrl: 'https://github.com/facebook/react',
        lastFetched: '2026-05-26T12:00:00.000Z',
        contentHash: 'abc123',
        chunkCount: 5,
        checksums: { 'react/getting-started.md': 'sha256hash' },
      },
    ],
    fileCount: 5,
    generatedAt: '2026-05-26T12:00:00.000Z',
  };

  it('accepts a valid registry', () => {
    const result = RegistrySchema.safeParse(validRegistry);
    expect(result.success).toBe(true);
  });

  it('rejects missing bundleFormatVersion with descriptive error', () => {
    const { bundleFormatVersion, ...rest } = validRegistry;
    const result = RegistrySchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.some((m) => m.length > 0)).toBe(true);
    }
  });

  it('rejects invalid sourceType', () => {
    const invalid = {
      ...validRegistry,
      libraries: [
        {
          ...validRegistry.libraries[0],
          sourceType: 'invalid-source',
        },
      ],
    };
    const result = RegistrySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
