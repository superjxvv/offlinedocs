import { AdapterError, type LibraryConfig, type Result, ok, err, MAX_RETRIES_CDN, RETRY_BASE_MS } from '@offlinedocs/shared';

import type { SourceAdapter, FetchResult, DocChunk, ValidationResult } from './types.js';
import { fetchWithRetry } from './retry.js';
import { extractMarkdownLinks, isAbsoluteUrl, resolveRelativePath, isWithinBasePath, getDirectoryPath } from './link-extractor.js';

const DEFAULT_MAX_DEPTH = 20;

interface GitHubParsed {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

interface GitHubContentEntry {
  name: string;
  path: string;
  type: string;
  download_url: string | null;
}

export function parseGitHubUrl(sourceUrl: string): GitHubParsed {
  // Handle: https://github.com/owner/repo/tree/branch/path
  //         https://github.com/owner/repo/blob/branch/path
  //         https://github.com/owner/repo
  //         owner/repo/path
  let urlPath: string;
  try {
    const url = new URL(sourceUrl);
    urlPath = url.pathname.replace(/^\//, '').replace(/\/$/, '');
  } catch {
    urlPath = sourceUrl.replace(/^\//, '').replace(/\/$/, '');
  }

  const parts = urlPath.split('/');
  const owner = parts[0] ?? '';
  const repo = parts[1] ?? '';

  if (!owner || !repo) {
    throw new Error(`Invalid GitHub URL: cannot extract owner/repo from "${sourceUrl}"`);
  }

  // Check for /tree/ or /blob/ pattern
  if (parts[2] === 'tree' || parts[2] === 'blob') {
    const branch = parts[3] ?? 'main';
    const path = parts.slice(4).join('/');
    return { owner, repo, branch, path };
  }

  // Plain path after owner/repo
  const path = parts.slice(2).join('/');
  return { owner, repo, branch: 'main', path };
}

function isMarkdownFile(name: string): boolean {
  return name.endsWith('.md') || name.endsWith('.mdx');
}

export class GitHubAdapter implements SourceAdapter {
  readonly sourceType = 'github' as const;

  async fetch(config: LibraryConfig): Promise<Result<FetchResult>> {
    let parsed: GitHubParsed;
    try {
      parsed = parseGitHubUrl(config.sourceUrl);
    } catch (cause) {
      return err(
        new AdapterError('CONFIG_INVALID', config.id, `Invalid GitHub URL: ${config.sourceUrl}`, cause instanceof Error ? cause : undefined),
      );
    }

    const { owner, repo, branch, path } = parsed;
    const maxDepth = config.maxDepth ?? DEFAULT_MAX_DEPTH;
    const followLinks = config.followLinks !== false;

    // Step 1: Recursively list all markdown files
    const listResult = await this.listDirectoryRecursive(owner, repo, branch, path, config.id, 0, maxDepth);
    if (!listResult.ok) {
      return listResult;
    }

    const mdFiles = listResult.data;

    if (mdFiles.length === 0) {
      return err(
        new AdapterError('EMPTY_RESPONSE', config.id, `No markdown files found in ${path || '/'}`),
      );
    }

    // Step 2: Fetch each markdown file
    const chunks: DocChunk[] = [];
    const fetchedPaths = new Set<string>();
    // Map chunk index → original file path (preserves extension for accurate link resolution)
    const chunkFilePaths: string[] = [];

    for (const file of mdFiles) {
      const contentResult = await this.fetchFileContent(
        owner, repo, branch, file.path, file.download_url, config.id,
      );
      if (!contentResult.ok) {
        return contentResult;
      }
      const content = contentResult.data;
      fetchedPaths.add(file.path);
      if (content.trim()) {
        chunkFilePaths.push(file.path);
        chunks.push({
          title: this.buildChunkTitle(file.path, path),
          content,
        });
      }
    }

    // Step 3: Follow links in fetched content
    if (followLinks) {
      await this.followLinks(chunks, chunkFilePaths, fetchedPaths, owner, repo, branch, path, config.id, maxDepth);
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

  private buildChunkTitle(filePath: string, basePath: string): string {
    // Strip base path prefix and extension
    let relative = filePath;
    if (basePath && relative.startsWith(basePath + '/')) {
      relative = relative.slice(basePath.length + 1);
    }
    // Remove extension
    return relative.replace(/\.mdx?$/, '');
  }

  private async listDirectoryRecursive(
    owner: string, repo: string, branch: string, path: string,
    libraryId: string, depth: number, maxDepth: number,
  ): Promise<Result<GitHubContentEntry[]>> {
    if (depth > maxDepth) {
      return ok([]);
    }

    const listResult = await this.listDirectory(owner, repo, branch, path, libraryId);
    if (!listResult.ok) {
      return listResult;
    }

    const entries = listResult.data;
    const mdFiles: GitHubContentEntry[] = [];

    const dirs: GitHubContentEntry[] = [];
    for (const entry of entries) {
      if (entry.type === 'file' && isMarkdownFile(entry.name)) {
        mdFiles.push(entry);
      } else if (entry.type === 'dir') {
        dirs.push(entry);
      }
    }

    // Recurse into subdirectories
    for (const dir of dirs) {
      const subResult = await this.listDirectoryRecursive(
        owner, repo, branch, dir.path, libraryId, depth + 1, maxDepth,
      );
      if (!subResult.ok) {
        return subResult;
      }
      mdFiles.push(...subResult.data);
    }

    return ok(mdFiles);
  }

  private async followLinks(
    chunks: DocChunk[],
    chunkFilePaths: string[],
    fetchedPaths: Set<string>,
    owner: string, repo: string, branch: string, basePath: string,
    libraryId: string, maxDepth: number,
  ): Promise<void> {
    // BFS over linked files
    let queue: Array<{ filePath: string; depth: number }> = [];

    // Extract links from initially fetched chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const originalPath = chunkFilePaths[i]!;
      const links = extractMarkdownLinks(chunk.content);
      for (const link of links) {
        if (isAbsoluteUrl(link)) continue;

        // Resolve relative to the original file's directory (not the extensionless title)
        const chunkDir = getDirectoryPath(originalPath);
        const resolved = resolveRelativePath(chunkDir, link);

        if (!fetchedPaths.has(resolved) && isMarkdownFile(resolved) && isWithinBasePath(resolved, basePath)) {
          queue.push({ filePath: resolved, depth: 1 });
          fetchedPaths.add(resolved);
        }
      }
    }

    // Process queue
    while (queue.length > 0) {
      const nextQueue: Array<{ filePath: string; depth: number }> = [];

      for (const { filePath, depth } of queue) {
        if (depth > maxDepth) continue;

        const contentResult = await this.fetchFileContent(
          owner, repo, branch, filePath, null, libraryId,
        );
        if (!contentResult.ok) {
          // Skip files that can't be fetched (may not exist)
          continue;
        }

        const content = contentResult.data;
        if (!content.trim()) continue;

        chunks.push({
          title: this.buildChunkTitle(filePath, basePath),
          content,
        });

        // Extract further links
        const links = extractMarkdownLinks(content);
        for (const link of links) {
          if (isAbsoluteUrl(link)) continue;
          const fileDir = getDirectoryPath(filePath);
          const resolved = resolveRelativePath(fileDir, link);
          if (!fetchedPaths.has(resolved) && isMarkdownFile(resolved) && isWithinBasePath(resolved, basePath)) {
            nextQueue.push({ filePath: resolved, depth: depth + 1 });
            fetchedPaths.add(resolved);
          }
        }
      }

      queue = nextQueue;
    }
  }

  private async listDirectory(
    owner: string, repo: string, branch: string, path: string, libraryId: string,
  ): Promise<Result<GitHubContentEntry[]>> {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const result = await this.fetchWithHeaders(apiUrl, headers, libraryId);
    if (!result.ok) {
      if (result.error.code === 'NETWORK' && result.error.statusCode === 404) {
        return err(
          new AdapterError('FORMAT_CHANGED', libraryId, `Path "${path || '/'}" not found in ${owner}/${repo}`),
        );
      }
      if (result.error.code === 'AUTH_REQUIRED' && !token) {
        return result as Result<GitHubContentEntry[]>;
      }
      return result as Result<GitHubContentEntry[]>;
    }

    let entries: GitHubContentEntry[];
    try {
      entries = JSON.parse(result.data) as GitHubContentEntry[];
    } catch {
      return err(
        new AdapterError('FORMAT_CHANGED', libraryId, 'GitHub API returned non-JSON response'),
      );
    }

    if (!Array.isArray(entries)) {
      return err(
        new AdapterError('FORMAT_CHANGED', libraryId, 'GitHub API returned non-array response (path may point to a file, not a directory)'),
      );
    }

    const validEntries = entries.filter(
      (e): e is GitHubContentEntry =>
        typeof e === 'object' && e !== null &&
        typeof e.name === 'string' && typeof e.path === 'string' && typeof e.type === 'string',
    );

    return ok(validEntries);
  }

  private async fetchFileContent(
    owner: string, repo: string, branch: string, filePath: string,
    downloadUrl: string | null, libraryId: string,
  ): Promise<Result<string>> {
    // Primary: raw.githubusercontent.com (no auth, no rate limits)
    const encodedFilePath = filePath.split('/').map(encodeURIComponent).join('/');
    const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodedFilePath}`;
    const rawResult = await fetchWithRetry(rawUrl, MAX_RETRIES_CDN, libraryId);

    if (rawResult.ok) {
      try {
        return ok(await rawResult.data.text());
      } catch (cause) {
        return err(
          new AdapterError('NETWORK', libraryId, `Failed to read response body from ${rawUrl}`, cause instanceof Error ? cause : undefined),
        );
      }
    }

    // On 403: fallback to API with GITHUB_TOKEN
    if (rawResult.error.code === 'AUTH_REQUIRED') {
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        return err(
          new AdapterError('AUTH_REQUIRED', libraryId, `Access denied for ${rawUrl} and no GITHUB_TOKEN set`),
        );
      }

      const fallbackApiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedFilePath}?ref=${encodeURIComponent(branch)}`;
      const apiUrl = this.isTrustedDownloadUrl(downloadUrl) ? downloadUrl : fallbackApiUrl;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3.raw',
      };
      const fallbackResult = await this.fetchWithHeaders(apiUrl, headers, libraryId);
      if (!fallbackResult.ok) {
        return fallbackResult;
      }
      return ok(fallbackResult.data);
    }

    return err(rawResult.error);
  }

  private isTrustedDownloadUrl(url: string | null): url is string {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'raw.githubusercontent.com' || parsed.hostname === 'github.com' || parsed.hostname.endsWith('.github.com');
    } catch {
      return false;
    }
  }

  private async fetchWithHeaders(
    url: string, headers: Record<string, string>, libraryId: string,
  ): Promise<Result<string>> {
    let lastError: Error | undefined;
    let lastStatus: number | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES_CDN; attempt++) {
      try {
        const response = await fetch(url, { headers });

        if (response.ok) {
          try {
            return ok(await response.text());
          } catch (cause) {
            return err(
              new AdapterError('NETWORK', libraryId, `Failed to read response body`, cause instanceof Error ? cause : undefined),
            );
          }
        }

        await response.body?.cancel();

        if (response.status === 401 || response.status === 403) {
          return err(
            new AdapterError('AUTH_REQUIRED', libraryId, `HTTP ${response.status} for ${url}`, undefined, response.status),
          );
        }

        if (response.status === 404) {
          return err(
            new AdapterError('NETWORK', libraryId, `HTTP 404 for ${url}`, undefined, 404),
          );
        }

        if (response.status === 429 || response.status === 503) {
          lastStatus = response.status;
          lastError = new Error(`HTTP ${response.status}`);
          if (attempt < MAX_RETRIES_CDN) {
            const delay = RETRY_BASE_MS * Math.pow(2, attempt) + (Math.random() * 400 - 200);
            await new Promise((resolve) => setTimeout(resolve, Math.max(0, delay)));
          }
          continue;
        }

        return err(
          new AdapterError('NETWORK', libraryId, `HTTP ${response.status} for ${url}`, undefined, response.status),
        );
      } catch (cause) {
        lastError = cause instanceof Error ? cause : new Error(String(cause));
        if (attempt < MAX_RETRIES_CDN) {
          const delay = RETRY_BASE_MS * Math.pow(2, attempt) + (Math.random() * 400 - 200);
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, delay)));
        }
      }
    }

    const code = lastStatus === 429 ? 'RATE_LIMITED' : 'NETWORK';
    return err(
      new AdapterError(code, libraryId, `Failed after ${MAX_RETRIES_CDN + 1} attempts: ${lastError?.message ?? 'unknown'}`, lastError),
    );
  }
}
