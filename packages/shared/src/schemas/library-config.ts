import { z } from 'zod/v4';

import { SourceTypeEnum } from './source-type.js';

export const LibraryConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceType: SourceTypeEnum,
  sourceUrl: z.string().min(1),
});

export type LibraryConfig = z.infer<typeof LibraryConfigSchema>;
