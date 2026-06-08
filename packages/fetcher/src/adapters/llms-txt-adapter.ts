import { AdapterError, type LibraryConfig, type Result, ok, err, MAX_RETRIES_CDN } from '@offlinedocs/shared';

import type { SourceAdapter, FetchResult, ValidationResult } from './types.js';
import { fetchWithRetry } from './retry.js';
import { splitByTopLevelHeadings } from '../chunk-processor/markdown-splitter.js';

export class LlmsTxtAdapter implements SourceAdapter {
  readonly sourceType = 'llms-txt' as const;

  async fetch(config: LibraryConfig): Promise<Result<FetchResult>> {
    const result = await fetchWithRetry(config.sourceUrl, MAX_RETRIES_CDN, config.id);
    if (!result.ok) {
      return result;
    }

    let text: string;
    try {
      text = await result.data.text();
    } catch (cause) {
      return err(
        new AdapterError('NETWORK', config.id, `Failed to read response body from ${config.sourceUrl}`, cause instanceof Error ? cause : undefined),
      );
    }
    if (!text.trim()) {
      return err(
        new AdapterError('EMPTY_RESPONSE', config.id, `Empty response from ${config.sourceUrl}`),
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

