import { describe, it, expect } from 'vitest';
import {
  extractMarkdownLinks,
  isAbsoluteUrl,
  resolveRelativePath,
  isWithinBasePath,
  getDirectoryPath,
} from './link-extractor.js';

describe('extractMarkdownLinks', () => {
  it('extracts relative .md links', () => {
    const content = 'See [guide](./guide.md) and [setup](../setup.md)';
    expect(extractMarkdownLinks(content)).toEqual(['./guide.md', '../setup.md']);
  });

  it('extracts .mdx links', () => {
    const content = 'Check [component](./button.mdx)';
    expect(extractMarkdownLinks(content)).toEqual(['./button.mdx']);
  });

  it('extracts absolute URL links to .md files', () => {
    const content = '- [Docs](https://example.com/docs/intro.md)';
    expect(extractMarkdownLinks(content)).toEqual(['https://example.com/docs/intro.md']);
  });

  it('strips fragment from links', () => {
    const content = '[section](./guide.md#heading)';
    expect(extractMarkdownLinks(content)).toEqual(['./guide.md']);
  });

  it('deduplicates identical links', () => {
    const content = '[a](./guide.md) and [b](./guide.md)';
    expect(extractMarkdownLinks(content)).toEqual(['./guide.md']);
  });

  it('ignores links to non-markdown files', () => {
    const content = '[img](./photo.png) [script](./app.ts) [page](./page.md)';
    expect(extractMarkdownLinks(content)).toEqual(['./page.md']);
  });

  it('ignores data and mailto URIs', () => {
    const content = '[x](data:text/plain.md) [y](mailto:a@b.md)';
    expect(extractMarkdownLinks(content)).toEqual([]);
  });

  it('returns empty array for content with no links', () => {
    expect(extractMarkdownLinks('Just some text')).toEqual([]);
  });

  it('handles multiple links on same line', () => {
    const content = '[a](a.md) [b](b.mdx) [c](c.md)';
    expect(extractMarkdownLinks(content)).toEqual(['a.md', 'b.mdx', 'c.md']);
  });
});

describe('isAbsoluteUrl', () => {
  it('returns true for http/https URLs', () => {
    expect(isAbsoluteUrl('https://example.com')).toBe(true);
    expect(isAbsoluteUrl('http://example.com')).toBe(true);
  });

  it('returns false for relative paths', () => {
    expect(isAbsoluteUrl('./guide.md')).toBe(false);
    expect(isAbsoluteUrl('../setup.md')).toBe(false);
    expect(isAbsoluteUrl('guide.md')).toBe(false);
  });
});

describe('resolveRelativePath', () => {
  it('resolves simple relative path', () => {
    expect(resolveRelativePath('docs/guides', 'intro.md')).toBe('docs/guides/intro.md');
  });

  it('resolves ./ prefix', () => {
    expect(resolveRelativePath('docs/guides', './intro.md')).toBe('docs/guides/intro.md');
  });

  it('resolves ../ to parent', () => {
    expect(resolveRelativePath('docs/guides', '../setup.md')).toBe('docs/setup.md');
  });

  it('resolves multiple ../', () => {
    expect(resolveRelativePath('docs/a/b', '../../top.md')).toBe('docs/top.md');
  });

  it('handles empty base path', () => {
    expect(resolveRelativePath('', 'guide.md')).toBe('guide.md');
  });
});

describe('isWithinBasePath', () => {
  it('returns true for paths within base', () => {
    expect(isWithinBasePath('docs/guides/intro.md', 'docs')).toBe(true);
  });

  it('returns false for paths outside base', () => {
    expect(isWithinBasePath('other/file.md', 'docs')).toBe(false);
  });

  it('returns true when base is empty', () => {
    expect(isWithinBasePath('any/path.md', '')).toBe(true);
  });

  it('does not match partial directory names', () => {
    expect(isWithinBasePath('docs-extra/file.md', 'docs')).toBe(false);
  });
});

describe('getDirectoryPath', () => {
  it('returns directory portion', () => {
    expect(getDirectoryPath('docs/guides/intro.md')).toBe('docs/guides');
  });

  it('returns empty for top-level file', () => {
    expect(getDirectoryPath('intro.md')).toBe('');
  });
});
