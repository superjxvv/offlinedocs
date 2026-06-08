import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import matter from '@11ty/gray-matter';

import { FrontmatterSchema, type Registry } from '@offlinedocs/shared';

export interface LoadedChunk {
  libraryId: string;
  filename: string;
  title: string;
  topics: string[];
  content: string;
  byteSize: number;
}

/**
 * Load all chunk files from a Doc Bundle, parsing frontmatter.
 * Invalid chunks are skipped with a warning to stderr.
 */
export async function loadChunks(
  bundlePath: string,
  registry: Registry,
): Promise<LoadedChunk[]> {
  const chunks: LoadedChunk[] = [];
  const resolvedBundlePath = path.resolve(bundlePath);

  for (const lib of registry.libraries) {
    const libDir = path.resolve(bundlePath, lib.id);
    if (!libDir.startsWith(resolvedBundlePath + path.sep)) {
      console.error(`Warning: Path traversal detected in library id: ${lib.id} — skipping`);
      continue;
    }

    let files: string[];
    try {
      files = await readdir(libDir);
    } catch {
      console.error(`Warning: Cannot read library directory ${lib.id} — skipping`);
      continue;
    }

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = path.join(libDir, file);
      let rawContent: string;
      try {
        rawContent = await readFile(filePath, 'utf-8');
      } catch {
        console.error(`Warning: Cannot read chunk file ${lib.id}/${file} — skipping`);
        continue;
      }

      let parsed;
      try {
        parsed = matter(rawContent);
      } catch {
        console.error(`Warning: Cannot parse frontmatter in ${lib.id}/${file} — skipping`);
        continue;
      }

      const fmResult = FrontmatterSchema.safeParse(parsed.data);
      if (!fmResult.success) {
        console.error(`Warning: Invalid frontmatter in ${lib.id}/${file} — skipping`);
        continue;
      }

      const byteSize = Buffer.byteLength(rawContent, 'utf-8');

      chunks.push({
        libraryId: lib.id,
        filename: file,
        title: fmResult.data.title,
        topics: fmResult.data.topics,
        content: parsed.content,
        byteSize,
      });
    }
  }

  return chunks;
}
