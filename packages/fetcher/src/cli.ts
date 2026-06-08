// @offlinedocs/fetcher CLI entrypoint
// Commander.js arg parsing only — no business logic here.
// Shebang injected by tsup banner config.

import { Command } from 'commander';

import { loadConfig } from './config/config-loader.js';
import { fetchLibraries } from './fetch-libraries.js';

const program = new Command();

program
  .name('offlinedocs-fetch')
  .description('Fetch library documentation for offline use');

program
  .command('fetch')
  .description('Fetch docs from configured library sources')
  .requiredOption('--config <path>', 'Path to libraries.toml config')
  .option('--bundle-path <path>', 'Output bundle directory', './doc-bundle')
  .option('--force', 'Re-fetch all libraries regardless of cache', false)
  .action(async (options: { config: string; bundlePath: string; force: boolean }) => {
    const configResult = await loadConfig(options.config);

    if (!configResult.ok) {
      console.error(`Error: ${configResult.error.message}`);
      process.exit(1);
    }

    const result = await fetchLibraries(configResult.data, {
      bundlePath: options.bundlePath,
      force: options.force,
    });

    // Exit 0 even with partial failures; exit 1 only on total failure
    if (result.fetched === 0 && result.failed > 0 && result.skipped === 0) {
      process.exit(1);
    }
  });

await program.parseAsync();
