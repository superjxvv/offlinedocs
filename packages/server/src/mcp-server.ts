import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import type { StartupResult } from './startup.js';
import { resolveLibraryId } from './tools/resolve-library-id.js';
import { queryDocs } from './tools/query-docs.js';

export interface McpServerOptions {
  staleThresholdDays?: number;
}

/**
 * Create an MCP server with resolve-library-id and query-docs tools.
 * Does NOT connect transport — caller handles that.
 */
export function createMcpServer(
  startupResult: StartupResult,
  options: McpServerOptions = {},
): McpServer {
  const { registry, index } = startupResult;

  const server = new McpServer({
    name: 'offlinedocs',
    version: '0.0.0',
  });

  server.tool(
    'resolve-library-id',
    'Search for a library by name in the offline documentation bundle',
    { name: z.string().min(1).describe('Library name or partial match query') },
    async ({ name }) => {
      try {
        const result = resolveLibraryId(registry, name);
        if ('code' in result) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      } catch (e) {
        console.error('resolve-library-id error:', e);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: e instanceof Error ? e.message : String(e),
                code: 'INTERNAL_ERROR',
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'query-docs',
    'Query documentation for a specific library',
    {
      libraryId: z.string().min(1).describe('Library ID from resolve-library-id'),
      query: z.string().min(1).describe('Search query for documentation'),
      maxTokens: z
        .number()
        .positive()
        .optional()
        .describe('Maximum tokens in response (default: 5000)'),
    },
    async ({ libraryId, query, maxTokens }) => {
      try {
        const result = queryDocs(registry, index, libraryId, query, {
          maxTokens,
          staleThresholdDays: options.staleThresholdDays,
        });
        if ('code' in result) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      } catch (e) {
        console.error('query-docs error:', e);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: e instanceof Error ? e.message : String(e),
                code: 'INTERNAL_ERROR',
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}

/**
 * Connect the MCP server to stdio transport.
 */
export async function connectStdioTransport(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
