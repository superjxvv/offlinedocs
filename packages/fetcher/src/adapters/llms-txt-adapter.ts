import { AdapterError, type LibraryConfig, type Result, ok, err, MAX_RETRIES_CDN } from '@offlinedocs/shared';

import type { SourceAdapter, FetchResult, ValidationResult } from './types.js';
import { fetchWithRetry } from './retry.js';
import { splitByTopLevelHeadings } from '../chunk-processor/markdown-splitter.js';
import { extractMarkdownLinks, isAbsoluteUrl } from './link-extractor.js';

const DEFAULT_MAX_DEPTH = 20;

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

    // Follow links if enabled
    if (config.followLinks !== false) {
      const maxDepth = config.maxDepth ?? DEFAULT_MAX_DEPTH;
      await this.followLinks(text, chunks, config, maxDepth);
    }

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

  private getOrigin(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.origin;
    } catch {
      return null;
    }
  }

  private async followLinks(
    initialContent: string,
    chunks: Array<{ title: string; content: string }>,
    config: LibraryConfig,
    maxDepth: number,
  ): Promise<void> {
    const sourceOrigin = this.getOrigin(config.sourceUrl);
    if (!sourceOrigin) return;

    const fetchedUrls = new Set<string>([config.sourceUrl]);

    // BFS: extract links from initial content
    let queue: Array<{ url: string; depth: number }> = [];

    const enqueueLinks = (content: string, depth: number) => {
      const links = extractMarkdownLinks(content);
      for (const link of links) {
        if (!isAbsoluteUrl(link)) continue;

        // Only follow same-origin links
        const linkOrigin = this.getOrigin(link);
        if (linkOrigin !== sourceOrigin) continue;

        if (!fetchedUrls.has(link)) {
          fetchedUrls.add(link);
          queue.push({ url: link, depth });
        }
      }
    };

    enqueueLinks(initialContent, 1);

    while (queue.length > 0) {
      const nextQueue: Array<{ url: string; depth: number }> = [];

      for (const { url, depth } of queue) {
        if (depth > maxDepth) continue;

        const result = await fetchWithRetry(url, MAX_RETRIES_CDN, config.id);
        if (!result.ok) continue;

        let text: string;
        try {
          text = await result.data.text();
        } catch {
          continue;
        }

        if (!text.trim()) continue;

        // Extract title from first H1 heading or use URL path
        const titleMatch = text.match(/^#\s+(.+)$/m);
        const title = titleMatch
          ? titleMatch[1]!.trim()
          : this.titleFromUrl(url);

        chunks.push({ title, content: text });

        // Extract further links for next depth
        const links = extractMarkdownLinks(text);
        for (const link of links) {
          if (!isAbsoluteUrl(link)) continue;
          const linkOrigin = this.getOrigin(link);
          if (linkOrigin !== sourceOrigin) continue;
          if (!fetchedUrls.has(link)) {
            fetchedUrls.add(link);
            nextQueue.push({ url: link, depth: depth + 1 });
          }
        }
      }

      queue = nextQueue;
    }
  }

  private titleFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/\.mdx?$/, '').replace(/^\/+|\/+$/g, '');
      return path.split('/').pop() || 'untitled';
    } catch {
      return 'untitled';
    }
  }
}
