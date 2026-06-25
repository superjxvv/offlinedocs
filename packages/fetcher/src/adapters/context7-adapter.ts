import { AdapterError, type LibraryConfig, type Result, ok, err, MAX_RETRIES_API } from '@offlinedocs/shared';

import type { SourceAdapter, FetchResult, ValidationResult } from './types.js';
import { fetchWithRetry } from './retry.js';
import { splitByTopLevelHeadings } from '../chunk-processor/markdown-splitter.js';

const CONTEXT7_BASE_URL = 'https://context7.com';

export class Context7Adapter implements SourceAdapter {
  readonly sourceType = 'context7' as const;

  async fetch(config: LibraryConfig): Promise<Result<FetchResult>> {
    const libraryId = config.sourceUrl.startsWith('/')
      ? config.sourceUrl
      : `/${config.sourceUrl}`;

    const url = `${CONTEXT7_BASE_URL}${libraryId}/llms.txt`;

    const result = await fetchWithRetry(url, MAX_RETRIES_API, config.id);

    if (!result.ok) {
      // Map 404 errors to FORMAT_CHANGED for invalid library IDs
      if (result.error.code === 'NETWORK' && result.error.statusCode === 404) {
        return err(
          new AdapterError('FORMAT_CHANGED', config.id, `Context7 library not found: ${libraryId}`),
        );
      }
      return result;
    }

    const response = result.data;

    let text: string;
    try {
      text = await response.text();
    } catch (cause) {
      return err(
        new AdapterError('NETWORK', config.id, `Failed to read response body from ${url}`, cause instanceof Error ? cause : undefined),
      );
    }

    if (!text.trim()) {
      return err(
        new AdapterError('EMPTY_RESPONSE', config.id, `Empty response from Context7 for ${libraryId}`),
      );
    }

    // Detect HTML responses (Context7 web UI instead of raw docs)
    if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
      return err(
        new AdapterError('FORMAT_CHANGED', config.id, `Context7 returned HTML instead of markdown for ${libraryId} — the API endpoint may have changed`),
      );
    }

    const chunks = splitByTopLevelHeadings(text);
    return ok({
      chunks,
      metadata: { fetchedAt: new Date().toISOString() },
    });
  }

  validate(result: FetchResult): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (result.chunks.length === 0) {
      errors.push('No chunks produced from fetched content');
    }

    for (let i = 0; i < result.chunks.length; i++) {
      const chunk = result.chunks[i]!;
      if (!chunk.content.trim()) {
        errors.push(`Chunk ${i} ("${chunk.title}") has empty content`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

