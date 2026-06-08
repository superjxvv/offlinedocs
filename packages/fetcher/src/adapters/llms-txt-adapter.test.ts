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
