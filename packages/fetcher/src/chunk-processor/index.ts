import type { Frontmatter } from '@offlinedocs/shared';

import type { DocChunk } from '../adapters/types.js';
import { splitMarkdown, toKebabFilename } from './markdown-splitter.js';
import { generateFrontmatter } from './frontmatter-generator.js';

export { splitMarkdown, splitByTopLevelHeadings, toKebabFilename } from './markdown-splitter.js';
export { generateFrontmatter, extractTopics } from './frontmatter-generator.js';

export interface ProcessedChunk {
  filename: string;
  content: string;
  frontmatter: Frontmatter;
}

/**
 * Process raw DocChunks into final, size-compliant chunks with frontmatter.
 * Orchestrates: split -> filename -> frontmatter generation.
 */
export function processChunks(libraryId: string, chunks: DocChunk[]): ProcessedChunk[] {
  const result: ProcessedChunk[] = [];
  const usedFilenames = new Set<string>();

  for (const chunk of chunks) {
    const splitChunks = splitMarkdown(chunk.content, libraryId);

    for (const split of splitChunks) {
      let baseFilename = toKebabFilename(split.title, libraryId);

      if (split.part !== undefined) {
        baseFilename = `${baseFilename}-${split.part}`;
      }

      // Deduplicate filenames
      let filename = `${baseFilename}.md`;
      if (usedFilenames.has(filename)) {
        let counter = 2;
        while (usedFilenames.has(`${baseFilename}-${counter}.md`)) {
          counter++;
        }
        filename = `${baseFilename}-${counter}.md`;
      }
      usedFilenames.add(filename);

      const { frontmatter, serialized } = generateFrontmatter(
        split.title,
        libraryId,
        split.content,
        split.part,
      );

      result.push({ filename, content: serialized, frontmatter });
    }
  }

  return result;
}
