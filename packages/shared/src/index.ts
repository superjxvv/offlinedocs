// Schemas
export { RegistrySchema, type Registry } from './schemas/registry.js';
export { FrontmatterSchema, type Frontmatter } from './schemas/frontmatter.js';
export { LibraryConfigSchema, type LibraryConfig } from './schemas/library-config.js';

// Errors
export { AdapterError, type AdapterErrorCode } from './errors.js';

// Result
export { type Result, ok, err } from './result.js';

// Constants
export {
  SEARCH_WEIGHTS,
  RETRY_BASE_MS,
  MAX_CHUNK_SIZE,
  DEFAULT_MAX_TOKENS,
  BUNDLE_FORMAT_VERSION,
  STALE_THRESHOLD_DAYS,
  SYNONYM_MAP,
  MAX_RETRIES_CDN,
  MAX_RETRIES_API,
} from './constants.js';
