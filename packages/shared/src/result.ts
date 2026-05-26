import type { AdapterError } from './errors.js';

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: AdapterError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T>(error: AdapterError): Result<T> {
  return { ok: false, error };
}
