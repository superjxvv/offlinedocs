import { describe, it, expect } from 'vitest';
import { AdapterError } from './errors.js';
import type { AdapterErrorCode } from './errors.js';

describe('AdapterError', () => {
  it('constructs with required fields', () => {
    const error = new AdapterError('NETWORK', 'react', 'Connection timeout');
    expect(error.code).toBe('NETWORK');
    expect(error.libraryId).toBe('react');
    expect(error.message).toBe('Connection timeout');
    expect(error.cause).toBeUndefined();
    expect(error.name).toBe('AdapterError');
    expect(error).toBeInstanceOf(Error);
  });

  it('supports all error codes', () => {
    const codes: AdapterErrorCode[] = [
      'NETWORK',
      'AUTH_REQUIRED',
      'RATE_LIMITED',
      'FORMAT_CHANGED',
      'EMPTY_RESPONSE',
      'CONFIG_INVALID',
    ];
    for (const code of codes) {
      const error = new AdapterError(code, 'test-lib', `Error: ${code}`);
      expect(error.code).toBe(code);
    }
  });

  it('supports cause chaining', () => {
    const cause = new Error('ECONNREFUSED');
    const error = new AdapterError('NETWORK', 'react', 'Connection failed', cause);
    expect(error.cause).toBe(cause);
    expect(error.cause?.message).toBe('ECONNREFUSED');
  });
});
