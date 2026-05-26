import { z } from 'zod';

export const LibraryConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceType: z.enum(['llms-txt', 'github', 'context7']),
  sourceUrl: z.string(),
});

export type LibraryConfig = z.infer<typeof LibraryConfigSchema>;
