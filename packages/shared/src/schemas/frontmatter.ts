import { z } from 'zod';

export const FrontmatterSchema = z.object({
  title: z.string(),
  library: z.string(),
  topics: z.array(z.string()),
  part: z.number().int().optional(),
});

export type Frontmatter = z.infer<typeof FrontmatterSchema>;
