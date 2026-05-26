import { describe, it, expect } from 'vitest';
import { ok, err } from './result.js';
import { AdapterError } from './errors.js';
import type { Result } from './result.js';

describe('Result', () => {
  it('ok() creates a success result', () => {
    const result = ok({ chunks: [], metadata: { fetchedAt: '2026-01-01' } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.chunks).toEqual([]);
    }
  });

  it('err() creates a failure result', () => {
    const error = new AdapterError('NETWORK', 'react', 'Timeout');
    const result = err(error);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NETWORK');
      expect(result.error.libraryId).toBe('react');
    }
  });

  it('supports type narrowing via ok discriminant', () => {
    const result: Result<string> = ok('hello');

    if (result.ok) {
      // TypeScript narrows to { ok: true; data: string }
      const value: string = result.data;
      expect(value).toBe('hello');
    } else {
      // TypeScript narrows to { ok: false; error: AdapterError }
      const code: string = result.error.code;
      expect(code).toBeDefined();
    }
  });

  it('supports type narrowing on error path', () => {
    const error = new AdapterError('RATE_LIMITED', 'express', 'Too many requests');
    const result: Result<number> = err(error);

    if (!result.ok) {
      expect(result.error.code).toBe('RATE_LIMITED');
      expect(result.error.message).toBe('Too many requests');
    }
  });
});
