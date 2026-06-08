import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { fetchWithRetry } from './retry.js';

describe('fetchWithRetry', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('returns ok with Response on successful fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('hello', { status: 200 }));

    const result = await fetchWithRetry('https://example.com', 2, 'test-lib');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = await result.data.text();
    expect(text).toBe('hello');
  });

  it('returns NETWORK error on HTTP 404 without retrying', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    globalThis.fetch = mockFetch;

    const result = await fetchWithRetry('https://example.com', 2, 'test-lib');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NETWORK');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns AUTH_REQUIRED error on HTTP 401 without retrying', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    globalThis.fetch = mockFetch;

    const result = await fetchWithRetry('https://example.com', 2, 'test-lib');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('AUTH_REQUIRED');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns AUTH_REQUIRED error on HTTP 403 without retrying', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
    globalThis.fetch = mockFetch;

    const result = await fetchWithRetry('https://example.com', 2, 'test-lib');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('AUTH_REQUIRED');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on HTTP 429 and returns RATE_LIMITED if exhausted', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
    globalThis.fetch = mockFetch;

    const result = await fetchWithRetry('https://example.com', 2, 'test-lib');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RATE_LIMITED');
    // 1 initial + 2 retries = 3 total calls
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('retries on HTTP 429 and succeeds on retry', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('success', { status: 200 }));
    globalThis.fetch = mockFetch;

    const result = await fetchWithRetry('https://example.com', 2, 'test-lib');
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries on network error (fetch throws) and returns NETWORK if exhausted', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('DNS resolution failed'));
    globalThis.fetch = mockFetch;

    const result = await fetchWithRetry('https://example.com', 2, 'test-lib');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NETWORK');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('retries on network error and succeeds on retry', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    globalThis.fetch = mockFetch;

    const result = await fetchWithRetry('https://example.com', 2, 'test-lib');
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
