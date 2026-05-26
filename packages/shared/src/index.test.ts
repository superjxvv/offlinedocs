import { describe, it, expect } from 'vitest';
import {
  RegistrySchema,
  FrontmatterSchema,
  LibraryConfigSchema,
  AdapterError,
  ok,
  err,
  validateBundle,
  normalizeBundlePath,
  SEARCH_WEIGHTS,
  RETRY_BASE_MS,
  MAX_CHUNK_SIZE,
  DEFAULT_MAX_TOKENS,
  BUNDLE_FORMAT_VERSION,
  STALE_THRESHOLD_DAYS,
  SYNONYM_MAP,
  MAX_RETRIES_CDN,
  MAX_RETRIES_API,
} from './index.js';

describe('@offlinedocs/shared barrel exports', () => {
  it('exports all schemas', () => {
    expect(RegistrySchema).toBeDefined();
    expect(FrontmatterSchema).toBeDefined();
    expect(LibraryConfigSchema).toBeDefined();
  });

  it('exports error class', () => {
    expect(AdapterError).toBeDefined();
    expect(new AdapterError('NETWORK', 'test', 'msg')).toBeInstanceOf(Error);
  });

  it('exports Result helpers', () => {
    expect(ok).toBeInstanceOf(Function);
    expect(err).toBeInstanceOf(Function);
  });

  it('exports bundle validation utilities', () => {
    expect(validateBundle).toBeInstanceOf(Function);
    expect(normalizeBundlePath).toBeInstanceOf(Function);
  });

  it('exports all constants', () => {
    expect(SEARCH_WEIGHTS).toEqual({ topics: 3, title: 2, body: 1 });
    expect(RETRY_BASE_MS).toBe(1000);
    expect(MAX_CHUNK_SIZE).toBe(50 * 1024);
    expect(DEFAULT_MAX_TOKENS).toBe(5000);
    expect(BUNDLE_FORMAT_VERSION).toBe(1);
    expect(STALE_THRESHOLD_DAYS).toBe(30);
    expect(SYNONYM_MAP).toBeDefined();
    expect(MAX_RETRIES_CDN).toBe(2);
    expect(MAX_RETRIES_API).toBe(3);
  });
});
