import { describe, it, expect } from 'vitest';
import { LibraryConfigSchema } from './library-config.js';

describe('LibraryConfigSchema', () => {
  it('accepts valid llms-txt config', () => {
    const result = LibraryConfigSchema.safeParse({
      id: 'react',
      name: 'React',
      sourceType: 'llms-txt',
      sourceUrl: 'https://react.dev/llms.txt',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid github config', () => {
    const result = LibraryConfigSchema.safeParse({
      id: 'next-js',
      name: 'Next.js',
      sourceType: 'github',
      sourceUrl: 'https://github.com/vercel/next.js',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid context7 config', () => {
    const result = LibraryConfigSchema.safeParse({
      id: 'express',
      name: 'Express',
      sourceType: 'context7',
      sourceUrl: 'https://context7.com/expressjs/express',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = LibraryConfigSchema.safeParse({
      id: 'react',
      name: 'React',
    });
    expect(result.success).toBe(false);

    const result2 = LibraryConfigSchema.safeParse({
      sourceType: 'github',
      sourceUrl: 'https://example.com',
    });
    expect(result2.success).toBe(false);
  });

  it('rejects invalid sourceType', () => {
    const result = LibraryConfigSchema.safeParse({
      id: 'react',
      name: 'React',
      sourceType: 'npm',
      sourceUrl: 'https://npmjs.com/react',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional maxDepth and followLinks', () => {
    const result = LibraryConfigSchema.safeParse({
      id: 'react',
      name: 'React',
      sourceType: 'github',
      sourceUrl: 'https://github.com/facebook/react',
      maxDepth: 5,
      followLinks: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxDepth).toBe(5);
      expect(result.data.followLinks).toBe(false);
    }
  });

  it('defaults maxDepth and followLinks to undefined when absent', () => {
    const result = LibraryConfigSchema.safeParse({
      id: 'react',
      name: 'React',
      sourceType: 'github',
      sourceUrl: 'https://github.com/facebook/react',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxDepth).toBeUndefined();
      expect(result.data.followLinks).toBeUndefined();
    }
  });

  it('rejects invalid maxDepth values', () => {
    const zero = LibraryConfigSchema.safeParse({
      id: 'react', name: 'React', sourceType: 'github',
      sourceUrl: 'https://github.com/facebook/react', maxDepth: 0,
    });
    expect(zero.success).toBe(false);

    const negative = LibraryConfigSchema.safeParse({
      id: 'react', name: 'React', sourceType: 'github',
      sourceUrl: 'https://github.com/facebook/react', maxDepth: -1,
    });
    expect(negative.success).toBe(false);

    const decimal = LibraryConfigSchema.safeParse({
      id: 'react', name: 'React', sourceType: 'github',
      sourceUrl: 'https://github.com/facebook/react', maxDepth: 2.5,
    });
    expect(decimal.success).toBe(false);
  });
});
