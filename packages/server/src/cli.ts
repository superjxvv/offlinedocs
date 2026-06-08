import { STALE_THRESHOLD_DAYS } from '@offlinedocs/shared';

import { startupBundle } from './startup.js';
import { createMcpServer, connectStdioTransport } from './mcp-server.js';

interface CliArgs {
  bundlePath: string;
  skipIntegrity: boolean;
  staleThresholdDays: number;
}

function parseArgs(argv: string[]): CliArgs {
  const bundleIndex = argv.indexOf('--bundle');
  if (bundleIndex === -1 || !argv[bundleIndex + 1]) {
    console.error(
      'Usage: offlinedocs-server --bundle <path> [--skip-integrity] [--stale-threshold-days <number>]',
    );
    process.exit(1);
  }
  const bundlePath = argv[bundleIndex + 1]!;
  const skipIntegrity = argv.includes('--skip-integrity');
  const staleIndex = argv.indexOf('--stale-threshold-days');
  let staleThresholdDays = STALE_THRESHOLD_DAYS;
  if (staleIndex !== -1 && argv[staleIndex + 1]) {
    staleThresholdDays = parseInt(argv[staleIndex + 1]!, 10);
    if (Number.isNaN(staleThresholdDays) || staleThresholdDays < 0) {
      console.error('Error: --stale-threshold-days must be a non-negative integer');
      process.exit(1);
    }
  }
  return { bundlePath, skipIntegrity, staleThresholdDays };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const result = await startupBundle(args.bundlePath, {
    skipIntegrity: args.skipIntegrity,
  });
  if (!result.ok) {
    console.error(`Error: ${result.error.message}`);
    process.exit(1);
  }

  const server = createMcpServer(result.data, {
    staleThresholdDays: args.staleThresholdDays,
  });

  console.error(
    `OfflineDocs MCP server ready: ${result.data.registry.libraries.length} libraries`,
  );

  // Graceful shutdown on SIGTERM/SIGINT
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      console.error(`Received ${signal}, shutting down...`);
      server.close().catch(() => {}).finally(() => process.exit(0));
    });
  }

  await connectStdioTransport(server);
}

main().catch((err) => {
  console.error(`Fatal: ${(err as Error).message}`);
  process.exit(1);
});
