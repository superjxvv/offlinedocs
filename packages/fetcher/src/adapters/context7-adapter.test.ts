import { describe, it, expect, vi, afterEach } from 'vitest';

import { Context7Adapter } from './context7-adapter.js';

const SAMPLE_DOCS = `# Getting Started

React is a JavaScript library for building user interfaces.

# Hooks

Hooks let you use state and other React features.

# API Reference

The React API includes createElement, Component, and more.
`;

describe('Context7Adapter', () => {
  const adapter = new Context7Adapter();
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('has sourceType "context7"', () => {
    expect(adapter.sourceType).toBe('context7');
  });

  it('returns ok with DocChunks on successful fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(SAMPLE_DOCS, { status: 200 }),
    );

    const config = {
      id: 'react',
      name: 'React',
      sourceType: 'context7' as const,
      sourceUrl: '/facebook/react',
    };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.chunks.length).toBe(3);
    expect(result.data.chunks[0]!.title).toBe('Getting Started');
    expect(result.data.chunks[0]!.content).toContain('JavaScript library');
    expect(result.data.chunks[1]!.title).toBe('Hooks');
    expect(result.data.chunks[2]!.title).toBe('API Reference');
    expect(result.data.metadata.fetchedAt).toBeTruthy();
  });

  it('constructs correct Context7 API URL from sourceUrl library ID', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(SAMPLE_DOCS, { status: 200 }),
    );

    const config = {
      id: 'nextjs',
      name: 'Next.js',
      sourceType: 'context7' as const,
      sourceUrl: '/vercel/next.js',
    };
    await adapter.fetch(config);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('/vercel/next.js');
    expect(calledUrl).toContain('context7.com');
  });

  it('returns FORMAT_CHANGED on HTTP 404 (invalid library ID)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Not Found', { status: 404 }),
    );

    const config = {
      id: 'nonexistent',
      name: 'Nonexistent',
      sourceType: 'context7' as const,
      sourceUrl: '/invalid/library',
    };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('FORMAT_CHANGED');
    expect(result.error.libraryId).toBe('nonexistent');
  });

  it('returns NETWORK error after retry exhaustion on network failure', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const config = {
      id: 'react',
      name: 'React',
      sourceType: 'context7' as const,
      sourceUrl: '/facebook/react',
    };
    const resultPromise = adapter.fetch(config);

    // Advance through all retry delays
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(10_000);
    }

    const result = await resultPromise;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NETWORK');
    expect(result.error.libraryId).toBe('react');
    // MAX_RETRIES_API = 3, so 4 total attempts (initial + 3 retries)
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it('returns EMPTY_RESPONSE on HTTP 200 with empty body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('', { status: 200 }),
    );

    const config = {
      id: 'react',
      name: 'React',
      sourceType: 'context7' as const,
      sourceUrl: '/facebook/react',
    };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('EMPTY_RESPONSE');
    expect(result.error.libraryId).toBe('react');
  });

  it('returns EMPTY_RESPONSE on whitespace-only body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('   \n\n  ', { status: 200 }),
    );

    const config = {
      id: 'react',
      name: 'React',
      sourceType: 'context7' as const,
      sourceUrl: '/facebook/react',
    };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('EMPTY_RESPONSE');
  });

  it('returns RATE_LIMITED on persistent HTTP 429', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('', { status: 429 }),
    );

    const config = {
      id: 'react',
      name: 'React',
      sourceType: 'context7' as const,
      sourceUrl: '/facebook/react',
    };
    const resultPromise = adapter.fetch(config);

    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(10_000);
    }

    const result = await resultPromise;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RATE_LIMITED');
  });

  it('handles response body read failure gracefully', async () => {
    const badResponse = new Response('data', { status: 200 });
    vi.spyOn(badResponse, 'text').mockRejectedValue(new Error('Body stream error'));
    globalThis.fetch = vi.fn().mockResolvedValue(badResponse);

    const config = {
      id: 'react',
      name: 'React',
      sourceType: 'context7' as const,
      sourceUrl: '/facebook/react',
    };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NETWORK');
  });

  it('handles sourceUrl without leading slash', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(SAMPLE_DOCS, { status: 200 }),
    );

    const config = {
      id: 'react',
      name: 'React',
      sourceType: 'context7' as const,
      sourceUrl: 'facebook/react',
    };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.chunks.length).toBeGreaterThan(0);
  });

  describe('validate', () => {
    it('returns valid for non-empty chunks', () => {
      const result = adapter.validate({
        chunks: [{ content: '# Title\nSome content', title: 'Title' }],
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
