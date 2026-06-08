import { describe, it, expect } from 'vitest';

import { splitMarkdown, toKebabFilename } from './markdown-splitter.js';

describe('splitMarkdown', () => {
  it('splits by H2 headings into separate chunks', () => {
    const content = `## Getting Started

Some intro text here.

## Hooks

Hooks are great.

## API Reference

The API docs.
`;
    const result = splitMarkdown(content, 'react');
    expect(result).toHaveLength(3);
    expect(result[0]!.title).toBe('Getting Started');
    expect(result[0]!.content).toContain('Some intro text');
    expect(result[1]!.title).toBe('Hooks');
    expect(result[2]!.title).toBe('API Reference');
  });

  it('keeps small single-section document as one chunk', () => {
    const content = '## Introduction\n\nThis is a small document.';
    const result = splitMarkdown(content, 'react');
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('Introduction');
  });

  it('handles content before first heading as preamble chunk', () => {
    const content = `Some preamble content here.

## First Section

Section content.
`;
    const result = splitMarkdown(content, 'react');
    expect(result).toHaveLength(2);
    expect(result[0]!.title).toBe('react');
    expect(result[0]!.content).toContain('preamble');
    expect(result[1]!.title).toBe('First Section');
  });

  it('splits oversized chunk into numbered parts', () => {
    // Create content > 50KB in a single section
    const bigContent = '## Big Section\n\n' + Array(600).fill('Lorem ipsum dolor sit amet. '.repeat(10) + '\n\n').join('');
    const result = splitMarkdown(bigContent, 'react');
    expect(result.length).toBeGreaterThan(1);
    expect(result[0]!.part).toBe(1);
    expect(result[1]!.part).toBe(2);
    expect(result[0]!.title).toBe('Big Section');
    // Each part should be under 50KB
    for (const chunk of result) {
      expect(Buffer.byteLength(chunk.content, 'utf8')).toBeLessThanOrEqual(50 * 1024);
    }
  });

  it('falls back to paragraph splitting when no headings exist', () => {
    // Create a doc with no headings that exceeds 50KB
    const bigContent = Array(600).fill('Lorem ipsum dolor sit amet. '.repeat(10) + '\n\n').join('');
    const result = splitMarkdown(bigContent, 'mylib');
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(Buffer.byteLength(chunk.content, 'utf8')).toBeLessThanOrEqual(50 * 1024);
    }
    // First chunk should use library name as title
    expect(result[0]!.title).toBe('mylib');
    expect(result[0]!.part).toBe(1);
  });

  it('does not split small document without headings', () => {
    const content = 'Just some plain text without any headings.';
    const result = splitMarkdown(content, 'mylib');
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('mylib');
    expect(result[0]!.part).toBeUndefined();
  });

  it('handles empty content', () => {
    const result = splitMarkdown('', 'react');
    expect(result).toHaveLength(0);
  });

  it('handles whitespace-only content', () => {
    const result = splitMarkdown('   \n\n  ', 'react');
    expect(result).toHaveLength(0);
  });
});

describe('toKebabFilename', () => {
  it('converts heading to kebab-case', () => {
    expect(toKebabFilename('API Reference')).toBe('api-reference');
  });

  it('handles special characters', () => {
    expect(toKebabFilename('React.useEffect() Hook')).toBe('react-useeffect-hook');
  });

  it('collapses multiple hyphens', () => {
    expect(toKebabFilename('Hello --- World')).toBe('hello-world');
  });

  it('trims leading and trailing hyphens', () => {
    expect(toKebabFilename('--Hello World--')).toBe('hello-world');
  });

  it('strips OS-unsafe characters', () => {
    expect(toKebabFilename('File: "name" <test>')).toBe('file-name-test');
  });

  it('truncates long filenames to fit path limit', () => {
    const longTitle = 'a'.repeat(250);
    const filename = toKebabFilename(longTitle, 'some-library');
    // {libraryId}/{filename}.md must be < 200 chars
    const fullPath = `some-library/${filename}.md`;
    expect(fullPath.length).toBeLessThan(200);
  });

  it('handles empty string', () => {
    expect(toKebabFilename('')).toBe('untitled');
  });
});
