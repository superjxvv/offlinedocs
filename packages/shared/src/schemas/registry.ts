import { z } from 'zod';

const SourceTypeEnum = z.enum(['llms-txt', 'github', 'context7']);

const LibraryEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string().optional(),
  sourceType: SourceTypeEnum,
  sourceUrl: z.string(),
  lastFetched: z.string(),
  contentHash: z.string(),
  chunkCount: z.number().int(),
  checksums: z.record(z.string(), z.string()),
});

export const RegistrySchema = z.object({
  bundleFormatVersion: z.number().int().describe('Bundle format version number'),
  libraries: z.array(LibraryEntrySchema),
  fileCount: z.number().int(),
  generatedAt: z.string(),
});

export type Registry = z.infer<typeof RegistrySchema>;
