import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Registry, Result } from '@offlinedocs/shared';
import { AdapterError, ok, err } from '@offlinedocs/shared';

export interface BundleValidationResult {
  valid: boolean;
  errors: string[];
}

export interface BundleValidationOptions {
  skipIntegrity?: boolean;
}

/**
 * Validate a Doc Bundle at server startup.
 * Checks file count and optionally verifies SHA-256 checksums.
 */
export async function validateBundleStartup(
  bundlePath: string,
  registry: Registry,
  options: BundleValidationOptions = {},
): Promise<Result<BundleValidationResult>> {
  const errors: string[] = [];
  const resolvedBundlePath = path.resolve(bundlePath);

  // Count all files across library subdirectories
  let actualFileCount = 0;
  for (const lib of registry.libraries) {
    const libDir = path.resolve(bundlePath, lib.id);
    if (!libDir.startsWith(resolvedBundlePath + path.sep)) {
      errors.push(`Path traversal detected in library id: ${lib.id}`);
      continue;
    }
    try {
      const files = await readdir(libDir);
      actualFileCount += files.length;
    } catch {
      errors.push(`Library directory missing: ${lib.id}`);
    }
  }

  if (registry.fileCount !== actualFileCount) {
    errors.push(
      `File count mismatch: registry declares ${registry.fileCount} files but found ${actualFileCount} on disk`,
    );
  }

  // SHA-256 checksum verification (unless skipped)
  if (!options.skipIntegrity) {
    for (const lib of registry.libraries) {
      for (const [relativePath, expectedChecksum] of Object.entries(lib.checksums)) {
        const filePath = path.resolve(bundlePath, relativePath);
        if (!filePath.startsWith(resolvedBundlePath + path.sep)) {
          errors.push(`Path traversal detected in checksum key: ${relativePath}`);
          continue;
        }
        try {
          const content = await readFile(filePath);
          const actualChecksum = createHash('sha256').update(content).digest('hex');
          if (actualChecksum !== expectedChecksum) {
            errors.push(
              `Checksum mismatch for ${relativePath}: expected ${expectedChecksum}, got ${actualChecksum}`,
            );
          }
        } catch {
          errors.push(`Cannot read file for checksum verification: ${relativePath}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return err(
      new AdapterError('FORMAT_CHANGED', '', `Bundle validation failed: ${errors.join('; ')}`),
    );
  }

  return ok({ valid: true, errors: [] });
}
