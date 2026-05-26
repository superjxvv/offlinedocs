import { z } from 'zod/v4';

import { SourceTypeEnum } from './source-type.js';

const LibraryEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  version: z.string().optional(),
  sourceType: SourceTypeEnum,
  sourceUrl: z.string().min(1),
  lastFetched: z.string().min(1),
  contentHash: z.string().min(1),
  chunkCount: z.number().int().nonnegative(),
  checksums: z.record(z.string(), z.string()),
});

export const RegistrySchema = z.object({
  bundleFormatVersion: z.number().int().positive(),
  libraries: z.array(LibraryEntrySchema),
  fileCount: z.number().int().nonnegative(),
  generatedAt: z.string().min(1),
});

export type Registry = z.infer<typeof RegistrySchema>;
