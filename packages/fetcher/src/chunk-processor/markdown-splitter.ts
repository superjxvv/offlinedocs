import { MAX_CHUNK_SIZE } from '@offlinedocs/shared';

export interface SplitChunk {
  title: string;
  content: string;
  part?: number;
}

/**
 * Split markdown content into chunks by H2 headings, enforcing MAX_CHUNK_SIZE.
 * Falls back to paragraph-based splitting when no headings exist.
 */
export function splitMarkdown(content: string, libraryId: string): SplitChunk[] {
  if (!content.trim()) {
    return [];
  }

  const sections = splitByH2Headings(content, libraryId);

  // Enforce size limits on each section
  const result: SplitChunk[] = [];
  for (const section of sections) {
    if (Buffer.byteLength(section.content, 'utf8') <= MAX_CHUNK_SIZE) {
      result.push(section);
    } else {
      const parts = splitByParagraphs(section.content, section.title);
      result.push(...parts);
    }
  }

  return result;
}

function splitByH2Headings(content: string, libraryId: string): SplitChunk[] {
  const lines = content.split('\n');
  const sections: SplitChunk[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];
  let hasHeadings = false;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      hasHeadings = true;
      if (currentLines.length > 0) {
        const text = currentLines.join('\n').trim();
        if (text) {
          sections.push({
            title: currentTitle || libraryId,
            content: text,
          });
        }
      }
      currentTitle = line.slice(3).trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  // Flush remaining content
  if (currentLines.length > 0) {
    const text = currentLines.join('\n').trim();
    if (text) {
      sections.push({
        title: currentTitle || libraryId,
        content: text,
      });
    }
  }

  // No headings: treat entire content as a single section (caller handles size enforcement)
  if (!hasHeadings) {
    const trimmed = content.trim();
    return [{ title: libraryId, content: trimmed }];
  }

  return sections;
}

function splitByParagraphs(content: string, title: string): SplitChunk[] {
  const paragraphs = content.split(/\n\n+/);
  const parts: SplitChunk[] = [];
  let currentParts: string[] = [];
  let currentSize = 0;
  let partNum = 1;

  for (const para of paragraphs) {
    const paraSize = Buffer.byteLength(para, 'utf8');

    if (currentSize + paraSize + 2 > MAX_CHUNK_SIZE && currentParts.length > 0) {
      parts.push({
        title,
        content: currentParts.join('\n\n').trim(),
        part: partNum,
      });
      partNum++;
      currentParts = [];
      currentSize = 0;
    }

    // If a single paragraph exceeds MAX_CHUNK_SIZE, split it by lines
    if (paraSize > MAX_CHUNK_SIZE && currentParts.length === 0) {
      const lineParts = splitByLines(para, title, partNum);
      parts.push(...lineParts);
      partNum += lineParts.length;
      continue;
    }

    currentParts.push(para);
    currentSize += paraSize + 2; // +2 for \n\n separator
  }

  // Flush remaining
  if (currentParts.length > 0) {
    parts.push({
      title,
      content: currentParts.join('\n\n').trim(),
      part: parts.length > 0 ? partNum : undefined,
    });

    // If we ended up with multiple parts, ensure first also has part number
    if (parts.length > 1 && parts[parts.length - 1]!.part !== undefined) {
      // All parts should have part numbers if there are multiple
      for (let i = 0; i < parts.length; i++) {
        parts[i]!.part = i + 1;
      }
    }
  }

  return parts;
}

function splitByLines(text: string, title: string, startPartNum: number): SplitChunk[] {
  const lines = text.split('\n');
  const parts: SplitChunk[] = [];
  let currentLines: string[] = [];
  let currentSize = 0;
  let partNum = startPartNum;

  for (const line of lines) {
    const lineSize = Buffer.byteLength(line, 'utf8');
    if (currentSize + lineSize + 1 > MAX_CHUNK_SIZE && currentLines.length > 0) {
      parts.push({
        title,
        content: currentLines.join('\n').trim(),
        part: partNum,
      });
      partNum++;
      currentLines = [];
      currentSize = 0;
    }
    currentLines.push(line);
    currentSize += lineSize + 1;
  }

  if (currentLines.length > 0) {
    parts.push({
      title,
      content: currentLines.join('\n').trim(),
      part: partNum,
    });
  }

  return parts;
}

/**
 * Split markdown content into chunks by top-level (H1) headings.
 * Used by adapters for initial raw chunk extraction before processing.
 */
export function splitByTopLevelHeadings(text: string): Array<{ title: string; content: string }> {
  const lines = text.split('\n');
  const chunks: Array<{ title: string; content: string }> = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (currentLines.length > 0) {
        chunks.push({
          title: currentTitle || 'untitled',
          content: currentLines.join('\n').trim(),
        });
      }
      currentTitle = line.slice(2).trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    const content = currentLines.join('\n').trim();
    if (content) {
      chunks.push({
        title: currentTitle || 'untitled',
        content,
      });
    }
  }

  return chunks;
}

/**
 * Convert a heading string into a kebab-case, OS-safe filename (without extension).
 */
export function toKebabFilename(heading: string, libraryId?: string): string {
  if (!heading.trim()) {
    return 'untitled';
  }

  let result = heading
    .toLowerCase()
    // Strip OS-unsafe characters: < > : " / \ | ? *
    .replace(/[<>:"/\\|?*]/g, '')
    // Replace non-alphanumeric with hyphens
    .replace(/[^a-z0-9]+/g, '-')
    // Collapse multiple hyphens
    .replace(/-{2,}/g, '-')
    // Trim leading/trailing hyphens
    .replace(/^-+|-+$/g, '');

  if (!result) {
    return 'untitled';
  }

  // Enforce path limit: {libraryId}/{filename}.md < 200 chars
  if (libraryId) {
    const maxFilenameLen = 199 - libraryId.length - 1 - 3; // -1 for /, -3 for .md, total < 200
    if (result.length > maxFilenameLen) {
      result = result.slice(0, Math.max(1, maxFilenameLen));
      // Clean up trailing hyphen from truncation
      result = result.replace(/-+$/, '');
    }
  }

  return result || 'untitled';
}
