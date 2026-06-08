import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { LlmsTxtAdapter } from './llms-txt-adapter.js';

const SAMPLE_CONTENT = `# React Documentation

## Getting Started

React is a JavaScript library for building user interfaces.

## Hooks

Hooks let you use state and other React features in function components.
`;

describe('LlmsTxtAdapter', () => {
  const adapter = new LlmsTxtAdapter();
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has sourceType "llms-txt"', () => {
    expect(adapter.sourceType).toBe('llms-txt');
  });

  it('returns ok with DocChunks on successful fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(SAMPLE_CONTENT, { status: 200 }));

    const config = { id: 'react', name: 'React', sourceType: 'llms-txt' as const, sourceUrl: 'https://react.dev/llms.txt' };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.chunks.length).toBeGreaterThan(0);
    expect(result.data.chunks[0]!.content).toBeTruthy();
    expect(result.data.chunks[0]!.title).toBeTruthy();
    expect(result.data.metadata.fetchedAt).toBeTruthy();
  });

  it('returns NETWORK error on HTTP 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));

    const config = { id: 'react', name: 'React', sourceType: 'llms-txt' as const, sourceUrl: 'https://example.com/missing' };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NETWORK');
    expect(result.error.libraryId).toBe('react');
  });

  it('returns RATE_LIMITED error on persistent HTTP 429', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 429 }));

    const config = { id: 'react', name: 'React', sourceType: 'llms-txt' as const, sourceUrl: 'https://example.com/limited' };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RATE_LIMITED');
  });

  it('returns EMPTY_RESPONSE error on HTTP 200 with empty body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }));

    const config = { id: 'react', name: 'React', sourceType: 'llms-txt' as const, sourceUrl: 'https://example.com/empty' };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('EMPTY_RESPONSE');
    expect(result.error.libraryId).toBe('react');
  });

  it('returns EMPTY_RESPONSE error on whitespace-only body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('   \n\n  ', { status: 200 }));

    const config = { id: 'react', name: 'React', sourceType: 'llms-txt' as const, sourceUrl: 'https://example.com/blank' };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('EMPTY_RESPONSE');
  });

  it('uses Node.js built-in fetch (no external HTTP library)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('content', { status: 200 }));

    const config = { id: 'test', name: 'Test', sourceType: 'llms-txt' as const, sourceUrl: 'https://example.com' };
    await adapter.fetch(config);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('follows absolute markdown links from llms.txt content', async () => {
    const indexContent = `# My Lib\n\n- [Guide](https://example.com/docs/guide.md)\n- [API](https://example.com/docs/api.md)\n`;

    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === 'https://example.com/llms.txt') {
        return new Response(indexContent, { status: 200 });
      }
      if (urlStr === 'https://example.com/docs/guide.md') {
        return new Response('# Guide\n\nGuide content.', { status: 200 });
      }
      if (urlStr === 'https://example.com/docs/api.md') {
        return new Response('# API Reference\n\nAPI content.', { status: 200 });
      }
      return new Response('', { status: 404 });
    });

    const config = { id: 'mylib', name: 'My Lib', sourceType: 'llms-txt' as const, sourceUrl: 'https://example.com/llms.txt' };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Original chunk + 2 linked pages
    expect(result.data.chunks.length).toBe(3);
    const titles = result.data.chunks.map(c => c.title);
    expect(titles).toContain('Guide');
    expect(titles).toContain('API Reference');
  });

  it('only follows same-origin links', async () => {
    const indexContent = `# Lib\n\n- [Internal](https://example.com/docs/page.md)\n- [External](https://other.com/docs/page.md)\n`;

    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === 'https://example.com/llms.txt') {
        return new Response(indexContent, { status: 200 });
      }
      if (urlStr === 'https://example.com/docs/page.md') {
        return new Response('# Internal Page', { status: 200 });
      }
      return new Response('', { status: 404 });
    });

    const config = { id: 'lib', name: 'Lib', sourceType: 'llms-txt' as const, sourceUrl: 'https://example.com/llms.txt' };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Should not have fetched external link
    const fetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(c => (c[0] as string));
    expect(fetchCalls).not.toContain('https://other.com/docs/page.md');
  });

  it('prevents circular link following', async () => {
    const indexContent = `# Lib\n\n- [Page A](https://example.com/a.md)\n`;

    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === 'https://example.com/llms.txt') {
        return new Response(indexContent, { status: 200 });
      }
      if (urlStr === 'https://example.com/a.md') {
        return new Response('# A\n[Back to index](https://example.com/llms.txt)\n[To B](https://example.com/b.md)', { status: 200 });
      }
      if (urlStr === 'https://example.com/b.md') {
        return new Response('# B\n[To A](https://example.com/a.md)', { status: 200 });
      }
      return new Response('', { status: 404 });
    });

    const config = { id: 'lib', name: 'Lib', sourceType: 'llms-txt' as const, sourceUrl: 'https://example.com/llms.txt' };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Index chunk + A + B = 3 total, no infinite loop
    expect(result.data.chunks.length).toBe(3);
  });

  it('does not follow links when followLinks is false', async () => {
    const indexContent = `# Lib\n\n- [Page](https://example.com/page.md)\n`;

    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === 'https://example.com/llms.txt') {
        return new Response(indexContent, { status: 200 });
      }
      return new Response('# Page', { status: 200 });
    });

    const config = { id: 'lib', name: 'Lib', sourceType: 'llms-txt' as const, sourceUrl: 'https://example.com/llms.txt', followLinks: false };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only the initial chunk, no linked pages
    expect(result.data.chunks.length).toBe(1);
  });

  it('respects maxDepth for link following', async () => {
    const indexContent = `# Lib\n\n- [L1](https://example.com/l1.md)\n`;

    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr === 'https://example.com/llms.txt') {
        return new Response(indexContent, { status: 200 });
      }
      if (urlStr === 'https://example.com/l1.md') {
        return new Response('# L1\n[L2](https://example.com/l2.md)', { status: 200 });
      }
      if (urlStr === 'https://example.com/l2.md') {
        return new Response('# L2\n[L3](https://example.com/l3.md)', { status: 200 });
      }
      if (urlStr === 'https://example.com/l3.md') {
        return new Response('# L3', { status: 200 });
      }
      return new Response('', { status: 404 });
    });

    const config = { id: 'lib', name: 'Lib', sourceType: 'llms-txt' as const, sourceUrl: 'https://example.com/llms.txt', maxDepth: 1 };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Index + L1 only (depth 1), L2 would be depth 2
    expect(result.data.chunks.length).toBe(2);
    const titles = result.data.chunks.map(c => c.title);
    expect(titles).toContain('L1');
    expect(titles).not.toContain('L2');
  });

  describe('validate', () => {
    it('returns valid for non-empty chunks', () => {
      const result = adapter.validate({
        chunks: [{ content: 'some content', title: 'Title' }],
        metadata: { fetchedAt: new Date().toISOString() },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns invalid for empty chunks array', () => {
      const result = adapter.validate({
        chunks: [],
        metadata: { fetchedAt: new Date().toISOString() },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns invalid for chunks with empty content', () => {
      const result = adapter.validate({
        chunks: [{ content: '', title: 'Empty' }],
        metadata: { fetchedAt: new Date().toISOString() },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
