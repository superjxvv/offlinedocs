import { z } from 'zod/v4';

export const LibraryConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceType: z.enum(['llms-txt', 'github', 'context7']),
  sourceUrl: z.string().min(1),
});

export type LibraryConfig = z.infer<typeof LibraryConfigSchema>;
