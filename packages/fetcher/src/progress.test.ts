import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  reportStart,
  reportDone,
  reportFailed,
  reportSkipped,
  reportSummary,
  formatDuration,
} from './progress.js';

describe('progress reporter', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  describe('reportStart', () => {
    it('prints fetching line to stdout', () => {
      reportStart(1, 50, 'react');
      expect(stdoutSpy).toHaveBeenCalledWith('[ 1/50] react ... fetching');
    });
  });

  describe('reportDone', () => {
    it('prints done line with chunk count', () => {
      reportDone(1, 50, 'react', 23);
      expect(consoleSpy).toHaveBeenCalledWith(
        '\r[ 1/50] react ... done (23 chunks)',
      );
    });
  });

  describe('reportFailed', () => {
    it('prints FAILED line with error code', () => {
      reportFailed(2, 50, 'express', 'RATE_LIMITED');
      expect(consoleSpy).toHaveBeenCalledWith(
        '\r[ 2/50] express ... FAILED (RATE_LIMITED) -- skipped',
      );
    });
  });

  describe('reportSkipped', () => {
    it('prints skipped line with carriage return', () => {
      reportSkipped(3, 50, 'vue');
      expect(consoleSpy).toHaveBeenCalledWith(
        '\r[ 3/50] vue ... skipped (unchanged)',
      );
    });
  });

  describe('reportSummary', () => {
    it('prints summary line with counts and duration', () => {
      reportSummary(48, 1, 1, 272_000);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Fetched: 48 | Failed: 1 | Skipped (unchanged): 1 | Duration: 4m 32s',
      );
    });
  });

  describe('formatDuration', () => {
    it('formats sub-minute durations', () => {
      expect(formatDuration(45_000)).toBe('0m 45s');
    });

    it('formats multi-minute durations', () => {
      expect(formatDuration(272_000)).toBe('4m 32s');
    });

    it('formats zero duration', () => {
      expect(formatDuration(0)).toBe('0m 0s');
    });
  });

  describe('padding', () => {
    it('pads single-digit index in double-digit total', () => {
      reportSkipped(1, 10, 'lib');
      expect(consoleSpy).toHaveBeenCalledWith('\r[ 1/10] lib ... skipped (unchanged)');
    });

    it('does not pad when index same width as total', () => {
      reportSkipped(3, 3, 'lib');
      expect(consoleSpy).toHaveBeenCalledWith('\r[3/3] lib ... skipped (unchanged)');
    });
  });
});
