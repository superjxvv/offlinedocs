import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  RegistrySchema,
  type Registry,
  type Result,
  AdapterError,
  BUNDLE_FORMAT_VERSION,
  ok,
  err,
} from '@offlinedocs/shared';

/**
 * Load and validate registry.json from a Doc Bundle.
 * Returns a Result — callers decide how to handle errors.
 */
export async function loadRegistry(bundlePath: string): Promise<Result<Registry>> {
  const registryPath = path.join(bundlePath, 'registry.json');

  let content: string;
  try {
    content = await readFile(registryPath, 'utf-8');
  } catch {
    return err(
      new AdapterError('FORMAT_CHANGED', '', `registry.json not found at: ${registryPath}`),
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return err(
      new AdapterError('FORMAT_CHANGED', '', 'registry.json contains invalid JSON'),
    );
  }

  // Check bundleFormatVersion explicitly before full schema validation
  // so that any invalid version (including non-positive) gets a clear message.
  const rawVersion = (parsed as Record<string, unknown>).bundleFormatVersion;
  if (rawVersion !== BUNDLE_FORMAT_VERSION) {
    return err(
      new AdapterError(
        'FORMAT_CHANGED',
        '',
        `Expected bundleFormatVersion ${BUNDLE_FORMAT_VERSION}, got ${rawVersion}`,
      ),
    );
  }

  const result = RegistrySchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues;
    const detail = issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return err(
      new AdapterError('FORMAT_CHANGED', '', `registry.json schema validation failed: ${detail}`),
    );
  }

  return ok(result.data);
}
