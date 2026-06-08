/**
 * Extract markdown links pointing to .md or .mdx files from content.
 * Returns deduplicated link targets (href portion only).
 * Filters out fragment-only links and data/mailto URIs.
 */
export function extractMarkdownLinks(content: string): string[] {
  const linkRegex = /\[[^\]]*\]\(([^)]+\.mdx?)(?:#[^)]*)?\)/g;
  const seen = new Set<string>();
  const links: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(content)) !== null) {
    let href = match[1]!;

    // Strip trailing fragment if present (regex already handles #fragment before closing paren,
    // but handle edge cases like path.md#section)
    const fragmentIndex = href.indexOf('#');
    if (fragmentIndex !== -1) {
      href = href.slice(0, fragmentIndex);
    }

    // Skip empty, fragment-only, data URIs, mailto
    if (!href || href.startsWith('data:') || href.startsWith('mailto:')) {
      continue;
    }

    if (!seen.has(href)) {
      seen.add(href);
      links.push(href);
    }
  }

  return links;
}

/**
 * Check if a URL is absolute (has a protocol).
 */
export function isAbsoluteUrl(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url);
}

/**
 * Resolve a relative path against a base directory path.
 * Handles `.`, `..`, and normalizes slashes.
 */
export function resolveRelativePath(baseDirPath: string, relativePath: string): string {
  const parts = baseDirPath ? baseDirPath.split('/').filter(Boolean) : [];
  const relParts = relativePath.split('/');

  for (const part of relParts) {
    if (part === '.' || part === '') {
      continue;
    } else if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join('/');
}

/**
 * Check if a resolved path is within the given base path.
 */
export function isWithinBasePath(resolvedPath: string, basePath: string): boolean {
  if (!basePath) return true;
  const normalizedBase = basePath.replace(/\/$/, '');
  return resolvedPath === normalizedBase || resolvedPath.startsWith(normalizedBase + '/');
}

/**
 * Get the directory portion of a file path.
 */
export function getDirectoryPath(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash === -1 ? '' : filePath.slice(0, lastSlash);
}
