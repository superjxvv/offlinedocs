import matter from '@11ty/gray-matter';
import type { Frontmatter } from '@offlinedocs/shared';

export interface FrontmatterResult {
  frontmatter: Frontmatter;
  serialized: string;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'for',
  'from', 'has', 'have', 'he', 'her', 'his', 'how', 'i', 'if',
  'in', 'into', 'is', 'it', 'its', 'let', 'my', 'no', 'not',
  'of', 'on', 'or', 'our', 'she', 'so', 'than', 'that', 'the',
  'their', 'them', 'then', 'there', 'these', 'they', 'this',
  'to', 'us', 'use', 'was', 'we', 'what', 'when', 'which',
  'who', 'will', 'with', 'you', 'your',
]);

/**
 * Generate frontmatter for a chunk, returning both the data object and serialized output.
 */
export function generateFrontmatter(
  title: string,
  library: string,
  content: string,
  part?: number,
): FrontmatterResult {
  const topics = extractTopics(title, content);

  const frontmatterData: Frontmatter = {
    title,
    library,
    topics,
    ...(part !== undefined ? { part } : {}),
  };

  const serialized = matter.stringify(content, frontmatterData);

  return { frontmatter: frontmatterData, serialized };
}

/**
 * Extract topic keywords from heading text and content.
 * Returns 1-8 lowercase keywords with stop words filtered out.
 */
export function extractTopics(heading: string, content: string): string[] {
  const headingWords = tokenize(heading);
  const contentWords = tokenize(content.slice(0, 500)); // First ~500 chars

  // Heading words first (higher priority), then content words
  const seen = new Set<string>();
  const topics: string[] = [];

  for (const word of [...headingWords, ...contentWords]) {
    if (STOP_WORDS.has(word)) continue;
    if (word.length < 2) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    topics.push(word);
    if (topics.length >= 8) break;
  }

  return topics;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}
