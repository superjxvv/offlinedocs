import { z } from 'zod/v4';

import { SourceTypeEnum } from './source-type.js';

export const LibraryConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceType: SourceTypeEnum,
  sourceUrl: z.string().min(1),
  maxDepth: z.number().int().positive().optional(),
  followLinks: z.boolean().optional(),
});

export type LibraryConfig = z.infer<typeof LibraryConfigSchema>;
