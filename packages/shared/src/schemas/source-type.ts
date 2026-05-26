import { z } from 'zod/v4';

export const SourceTypeEnum = z.enum(['llms-txt', 'github', 'context7']);

export type SourceType = z.infer<typeof SourceTypeEnum>;
