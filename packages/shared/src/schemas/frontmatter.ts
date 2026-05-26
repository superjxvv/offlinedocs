import { z } from 'zod/v4';

export const FrontmatterSchema = z.object({
  title: z.string().min(1),
  library: z.string().min(1),
  topics: z.array(z.string()),
  part: z.number().int().positive().optional(),
});

export type Frontmatter = z.infer<typeof FrontmatterSchema>;
