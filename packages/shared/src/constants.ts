export const SEARCH_WEIGHTS = {
  topics: 3,
  title: 2,
  body: 1,
} as const;

export const RETRY_BASE_MS = 1000;

export const MAX_CHUNK_SIZE = 50 * 1024; // 50KB

export const DEFAULT_MAX_TOKENS = 5000;

export const BUNDLE_FORMAT_VERSION = 1;

export const STALE_THRESHOLD_DAYS = 30;

export const SYNONYM_MAP: Record<string, string[]> = {
  auth: ['authentication', 'authorization'],
  config: ['configuration', 'setup'],
  db: ['database'],
};

export const MAX_RETRIES_CDN = 2;

export const MAX_RETRIES_API = 3;
