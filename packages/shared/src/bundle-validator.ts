import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { RegistrySchema } from './schemas/registry.js';

export function normalizeBundlePath(p: string): string {
  return p.replace(/\\/g, '/');
}

export interface BundleValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export async function validateBundle(
  bundlePath: string,
): Promise<BundleValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Read registry.json
  const registryPath = path.join(bundlePath, 'registry.json');
  let registryRaw: string;
  try {
    registryRaw = await readFile(registryPath, 'utf-8');
  } catch {
    return { valid: false, errors: ['registry.json not found or unreadable'], warnings };
  }

  // 2. Parse and validate against RegistrySchema
  let registry;
  try {
    const parsed = JSON.parse(registryRaw);
    const result = RegistrySchema.safeParse(parsed);
    if (!result.success) {
      return {
        valid: false,
        errors: [`registry.json schema validation failed: ${result.error.message}`],
        warnings,
      };
    }
    registry = result.data;
  } catch {
    return { valid: false, errors: ['registry.json contains invalid JSON'], warnings };
  }

  // 3. Collect all chunk files on disk
  const resolvedBundlePath = path.resolve(bundlePath);
  const chunkFiles: string[] = [];
  for (const lib of registry.libraries) {
    const libDir = path.resolve(bundlePath, lib.id);
    if (!libDir.startsWith(resolvedBundlePath + path.sep)) {
      errors.push(`Path traversal detected in library id: ${lib.id}`);
      continue;
    }
    try {
      const files = await readdir(libDir);
      for (const file of files) {
        chunkFiles.push(path.posix.join(lib.id, file));
      }
    } catch {
      errors.push(`Library directory missing: ${lib.id}`);
    }
  }

  // 4. Check fileCount matches actual chunk files on disk
  if (registry.fileCount !== chunkFiles.length) {
    errors.push(
      `File count mismatch: registry declares ${registry.fileCount} files but found ${chunkFiles.length} on disk`,
    );
  }

  // 5. Verify SHA-256 checksums for each chunk file
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

  return { valid: errors.length === 0, errors, warnings };
}
