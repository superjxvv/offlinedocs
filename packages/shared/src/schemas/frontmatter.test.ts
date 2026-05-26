import { describe, it, expect } from 'vitest';
import { FrontmatterSchema } from './frontmatter.js';

describe('FrontmatterSchema', () => {
  const validFrontmatter = {
    title: 'Getting Started',
    library: 'react',
    topics: ['hooks', 'components', 'jsx'],
  };

  it('accepts valid frontmatter', () => {
    const result = FrontmatterSchema.safeParse(validFrontmatter);
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const { title, ...rest } = validFrontmatter;
    const result = FrontmatterSchema.safeParse(rest);
    expect(result.success).toBe(false);

    const result2 = FrontmatterSchema.safeParse({ title: 'Test' });
    expect(result2.success).toBe(false);
  });

  it('accepts optional part field', () => {
    const withPart = { ...validFrontmatter, part: 2 };
    const result = FrontmatterSchema.safeParse(withPart);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.part).toBe(2);
    }
  });

  it('works without optional part field', () => {
    const result = FrontmatterSchema.safeParse(validFrontmatter);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.part).toBeUndefined();
    }
  });
});
