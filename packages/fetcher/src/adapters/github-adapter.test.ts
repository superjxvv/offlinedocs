import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import { GitHubAdapter, parseGitHubUrl } from './github-adapter.js';

const CONTENTS_API_RESPONSE = JSON.stringify([
  { name: 'getting-started.md', path: 'docs/getting-started.md', type: 'file', download_url: 'https://raw.githubusercontent.com/owner/repo/main/docs/getting-started.md' },
  { name: 'api.md', path: 'docs/api.md', type: 'file', download_url: 'https://raw.githubusercontent.com/owner/repo/main/docs/api.md' },
  { name: 'images', path: 'docs/images', type: 'dir', download_url: null },
  { name: 'README.txt', path: 'docs/README.txt', type: 'file', download_url: null },
]);

function mockFetchSequence(...responses: Array<{ url?: string; status: number; body: string }>) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    calls.push(urlStr);
    const match = responses.find((r) => !r.url || urlStr.includes(r.url));
    if (match) {
      return new Response(match.body, { status: match.status });
    }
    return new Response('', { status: 200 });
  });
  return { fn, calls };
}

describe('parseGitHubUrl', () => {
  it('parses full GitHub URL with /tree/branch/path', () => {
    const result = parseGitHubUrl('https://github.com/expressjs/express/tree/main/docs');
    expect(result).toEqual({ owner: 'expressjs', repo: 'express', branch: 'main', path: 'docs' });
  });

  it('parses GitHub URL with /blob/branch/path', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo/blob/develop/src/lib');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', branch: 'develop', path: 'src/lib' });
  });

  it('parses GitHub URL without tree/blob (defaults to main, root path)', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', branch: 'main', path: '' });
  });

  it('parses plain owner/repo/path format', () => {
    const result = parseGitHubUrl('owner/repo/docs');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', branch: 'main', path: 'docs' });
  });

  it('throws for invalid URL with no repo', () => {
    expect(() => parseGitHubUrl('https://github.com/owner')).toThrow('cannot extract owner/repo');
  });
});

describe('GitHubAdapter', () => {
  const adapter = new GitHubAdapter();
  const originalFetch = globalThis.fetch;
  let savedToken: string | undefined;

  beforeEach(() => {
    savedToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (savedToken !== undefined) {
      process.env.GITHUB_TOKEN = savedToken;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
  });

  it('has sourceType "github"', () => {
    expect(adapter.sourceType).toBe('github');
  });

  it('returns DocChunks for all markdown files from a public repo', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('api.github.com')) {
        return new Response(CONTENTS_API_RESPONSE, { status: 200 });
      }
      if (urlStr.includes('raw.githubusercontent.com') && urlStr.includes('getting-started')) {
        return new Response('# Getting Started\n\nWelcome to the docs.', { status: 200 });
      }
      if (urlStr.includes('raw.githubusercontent.com') && urlStr.includes('api.md')) {
        return new Response('# API Reference\n\nEndpoints here.', { status: 200 });
      }
      return new Response('', { status: 404 });
    });

    const config = { id: 'express', name: 'Express', sourceType: 'github' as const, sourceUrl: 'https://github.com/expressjs/express/tree/main/docs' };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.chunks).toHaveLength(2);
    expect(result.data.chunks[0]!.title).toBe('getting-started');
    expect(result.data.chunks[1]!.title).toBe('api');
    expect(result.data.chunks[0]!.content).toContain('Getting Started');
    expect(result.data.metadata.fetchedAt).toBeTruthy();
  });

  it('uses raw.githubusercontent.com URLs for file content', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      calls.push(urlStr);
      if (urlStr.includes('api.github.com')) {
        return new Response(CONTENTS_API_RESPONSE, { status: 200 });
      }
      if (urlStr.includes('raw.githubusercontent.com')) {
        return new Response('content', { status: 200 });
      }
      return new Response('', { status: 404 });
    });

    const config = { id: 'test', name: 'Test', sourceType: 'github' as const, sourceUrl: 'https://github.com/owner/repo/tree/main/docs' };
    await adapter.fetch(config);

    const rawCalls = calls.filter((u) => u.includes('raw.githubusercontent.com'));
    expect(rawCalls.length).toBeGreaterThan(0);
    expect(rawCalls[0]).toContain('raw.githubusercontent.com/owner/repo/main/docs/');
  });

  it('falls back to API with GITHUB_TOKEN on 403', async () => {
    process.env.GITHUB_TOKEN = 'test-token-123';
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];

    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      const headers = init?.headers as Record<string, string> | undefined;
      calls.push({ url: urlStr, headers: headers ?? {} });

      if (urlStr.includes('api.github.com/repos') && urlStr.includes('contents/docs?')) {
        return new Response(JSON.stringify([
          { name: 'readme.md', path: 'docs/readme.md', type: 'file', download_url: 'https://dl.example.com/readme.md' },
        ]), { status: 200 });
      }
      if (urlStr.includes('raw.githubusercontent.com')) {
        return new Response('', { status: 403 });
      }
      // Fallback API call with auth
      if (headers?.['Authorization'] && headers?.['Accept']?.includes('raw')) {
        return new Response('# Docs content via API', { status: 200 });
      }
      return new Response('', { status: 404 });
    });

    const config = { id: 'private-lib', name: 'Private', sourceType: 'github' as const, sourceUrl: 'https://github.com/owner/repo/tree/main/docs' };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.chunks).toHaveLength(1);
    // Verify fallback API call included auth
    const authCalls = calls.filter((c) => c.headers?.['Authorization']?.includes('test-token-123'));
    expect(authCalls.length).toBeGreaterThan(0);
  });

  it('returns AUTH_REQUIRED when no GITHUB_TOKEN and 403', async () => {
    delete process.env.GITHUB_TOKEN;

    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('api.github.com')) {
        return new Response('', { status: 403 });
      }
      return new Response('', { status: 403 });
    });

    const config = { id: 'private', name: 'Private', sourceType: 'github' as const, sourceUrl: 'https://github.com/owner/repo/tree/main/docs' };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('AUTH_REQUIRED');
  });

  it('returns FORMAT_CHANGED when docs path does not exist (404)', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{"message":"Not Found"}', { status: 404 }));

    const config = { id: 'test', name: 'Test', sourceType: 'github' as const, sourceUrl: 'https://github.com/owner/repo/tree/main/nonexistent' };
    const result = await adapter.fetch(config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('FORMAT_CHANGED');
    expect(result.error.libraryId).toBe('test');
  });

  describe('validate', () => {
    it('returns valid for non-empty chunks', () => {
      const result = adapter.validate({
        chunks: [{ content: 'some content', title: 'Title' }],
        metadata: { fetchedAt: new Date().toISOString() },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns invalid for empty chunks array', () => {
      const result = adapter.validate({
        chunks: [],
        metadata: { fetchedAt: new Date().toISOString() },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
