import type { LoadedChunk } from '../chunk-loader.js';

export interface IndexedChunk {
  libraryId: string;
  filename: string;
  title: string;
  topics: string[];
  content: string;
  byteSize: number;
}

export interface PostingEntry {
  chunkIndex: number;
  field: 'topics' | 'title' | 'body';
}

export interface SearchIndex {
  chunks: IndexedChunk[];
  invertedIndex: Map<string, PostingEntry[]>;
}

const CODE_BLOCK_RE = /```[\s\S]*?```/g;
const URL_RE = /https?:\/\/\S+/g;

/**
 * Tokenize text: split on whitespace + punctuation, lowercase, deduplicate.
 */
export function tokenize(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[\s\p{P}]+/u)
        .filter((t) => t.length > 0),
    ),
  ];
}

/**
 * Strip code blocks and URLs from body text before tokenizing.
 */
function stripBodyNoise(text: string): string {
  return text.replace(CODE_BLOCK_RE, '').replace(URL_RE, '');
}

/**
 * Build an in-memory inverted index from loaded chunks.
 * Indexes three fields per chunk: topics, title, and body.
 */
export function buildIndex(chunks: LoadedChunk[]): SearchIndex {
  const start = performance.now();

  const indexedChunks: IndexedChunk[] = chunks.map((c) => ({
    libraryId: c.libraryId,
    filename: c.filename,
    title: c.title,
    topics: c.topics,
    content: c.content,
    byteSize: c.byteSize,
  }));

  const invertedIndex = new Map<string, PostingEntry[]>();

  function addPosting(token: string, chunkIndex: number, field: PostingEntry['field']): void {
    let postings = invertedIndex.get(token);
    if (!postings) {
      postings = [];
      invertedIndex.set(token, postings);
    }
    postings.push({ chunkIndex, field });
  }

  for (let i = 0; i < indexedChunks.length; i++) {
    const chunk = indexedChunks[i]!;

    // Index topics
    for (const topic of chunk.topics) {
      const tokens = tokenize(topic);
      for (const token of tokens) {
        addPosting(token, i, 'topics');
      }
    }

    // Index title
    const titleTokens = tokenize(chunk.title);
    for (const token of titleTokens) {
      addPosting(token, i, 'title');
    }

    // Index body (strip code blocks and URLs first)
    const cleanBody = stripBodyNoise(chunk.content);
    const bodyTokens = tokenize(cleanBody);
    for (const token of bodyTokens) {
      addPosting(token, i, 'body');
    }
  }

  const durationMs = Math.round(performance.now() - start);
  console.error(`Search index built: ${indexedChunks.length} chunks in ${durationMs}ms`);

  return { chunks: indexedChunks, invertedIndex };
}
