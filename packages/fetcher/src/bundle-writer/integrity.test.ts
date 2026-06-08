import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { computeChecksum, computeContentHash } from './integrity.js';

describe('integrity', () => {
  describe('computeChecksum', () => {
    it('returns SHA-256 hex digest for string content', () => {
      const content = 'hello world';
      const expected = createHash('sha256').update(content).digest('hex');
      expect(computeChecksum(content)).toBe(expected);
    });

    it('returns SHA-256 hex digest for Buffer content', () => {
      const content = Buffer.from('hello world');
      const expected = createHash('sha256').update(content).digest('hex');
      expect(computeChecksum(content)).toBe(expected);
    });

    it('produces consistent results for same input', () => {
      const content = 'test content for checksum';
      expect(computeChecksum(content)).toBe(computeChecksum(content));
    });

    it('produces different results for different input', () => {
      expect(computeChecksum('abc')).not.toBe(computeChecksum('def'));
    });

    it('returns a 64-character hex string', () => {
      const result = computeChecksum('test');
      expect(result).toMatch(/^[a-f0-9]{64}$/);
    });

    it('handles empty string', () => {
      const expected = createHash('sha256').update('').digest('hex');
      expect(computeChecksum('')).toBe(expected);
    });
  });

  describe('computeContentHash', () => {
    it('returns SHA-256 hex digest of raw content', () => {
      const rawContent = 'raw doc content\nwith multiple lines';
      const expected = createHash('sha256').update(rawContent).digest('hex');
      expect(computeContentHash(rawContent)).toBe(expected);
    });

    it('produces consistent results for same raw content', () => {
      const rawContent = 'some documentation text';
      expect(computeContentHash(rawContent)).toBe(computeContentHash(rawContent));
    });

    it('returns a 64-character hex string', () => {
      const result = computeContentHash('test');
      expect(result).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
