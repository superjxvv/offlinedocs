import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { Registry } from '@offlinedocs/shared';

import type { StartupResult } from './startup.js';
import { buildIndex } from './search/index.js';
import type { LoadedChunk } from './chunk-loader.js';
import { createMcpServer } from './mcp-server.js';

function makeStartupResult(overrides?: {
  registry?: Partial<Registry>;
  chunks?: LoadedChunk[];
}): StartupResult {
  const registry: Registry = {
    bundleFormatVersion: 1,
    fileCount: 1,
    generatedAt: '2026-05-01T00:00:00.000Z',
    libraries: [
      {
        id: 'react',
        name: 'React',
        description: 'A JavaScript library for building UIs',
        version: '18.3.1',
        sourceType: 'llms-txt',
        sourceUrl: 'https://example.com',
        lastFetched: '2026-05-20T00:00:00.000Z',
        contentHash: 'abc123',
        chunkCount: 1,
        checksums: {},
      },
    ],
    ...overrides?.registry,
  };
  const chunks: LoadedChunk[] = overrides?.chunks ?? [
    {
      libraryId: 'react',
      filename: 'hooks.md',
      title: 'React Hooks',
      topics: ['hooks', 'useEffect'],
      content: 'Hooks are a way to use state in function components',
      byteSize: 200,
    },
  ];
  const index = buildIndex(chunks);

  return { registry, chunks, index };
}

describe('createMcpServer', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('creates an MCP server instance', () => {
    const startupResult = makeStartupResult();
    const server = createMcpServer(startupResult);
    expect(server).toBeDefined();
  });

  it('creates server with staleThresholdDays option', () => {
    const startupResult = makeStartupResult();
    const server = createMcpServer(startupResult, {
      staleThresholdDays: 14,
    });
    expect(server).toBeDefined();
  });

  it('registers resolve-library-id and query-docs tools', () => {
    const startupResult = makeStartupResult();
    const server = createMcpServer(startupResult);
    // Access the underlying Server's request handlers via the public server property
    const underlying = server.server;
    // The server should have a listTools handler registered
    expect(underlying).toBeDefined();
    // Verify the McpServer has registered tools by checking private _registeredTools
    const tools = (server as unknown as Record<string, unknown>)['_registeredTools'];
    expect(tools).toBeDefined();
    if (tools instanceof Map) {
      expect(tools.has('resolve-library-id')).toBe(true);
      expect(tools.has('query-docs')).toBe(true);
    } else {
      // If it's a plain object
      const toolKeys = Object.keys(tools as Record<string, unknown>);
      expect(toolKeys).toContain('resolve-library-id');
      expect(toolKeys).toContain('query-docs');
    }
  });
});
