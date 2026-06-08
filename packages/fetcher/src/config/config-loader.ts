import { readFile } from 'node:fs/promises';

import { parse } from 'smol-toml';

import {
  LibraryConfigSchema,
  type LibraryConfig,
  AdapterError,
  type Result,
  ok,
  err,
} from '@offlinedocs/shared';

interface RawTomlConfig {
  library?: unknown[];
}

export async function loadConfig(configPath: string): Promise<Result<LibraryConfig[]>> {
  let content: string;
  try {
    content = await readFile(configPath, 'utf-8');
  } catch (cause) {
    return err(
      new AdapterError(
        'CONFIG_INVALID',
        '',
        `Failed to read config file: ${configPath}`,
        cause instanceof Error ? cause : undefined,
      ),
    );
  }

  let parsed: RawTomlConfig;
  try {
    parsed = parse(content) as RawTomlConfig;
  } catch (cause) {
    return err(
      new AdapterError(
        'CONFIG_INVALID',
        '',
        `Failed to parse TOML: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause instanceof Error ? cause : undefined,
      ),
    );
  }

  const entries = parsed.library;
  if (!Array.isArray(entries) || entries.length === 0) {
    return err(
      new AdapterError('CONFIG_INVALID', '', 'No [[library]] entries found in config file'),
    );
  }

  const configs: LibraryConfig[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const entryId =
      typeof entry === 'object' && entry !== null && 'id' in entry && typeof entry.id === 'string'
        ? entry.id
        : `entry[${i}]`;

    const result = LibraryConfigSchema.safeParse(entry);
    if (!result.success) {
      const issues = result.error.issues;
      const fieldInfo = issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      return err(
        new AdapterError(
          'CONFIG_INVALID',
          entryId,
          `Invalid library config "${entryId}": ${fieldInfo}`,
        ),
      );
    }
    configs.push(result.data);
  }

  return ok(configs);
}
