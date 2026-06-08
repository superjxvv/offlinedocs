import type { LibraryConfig, Result } from '@offlinedocs/shared';

export interface DocChunk {
  content: string;
  title: string;
}

export interface FetchResult {
  chunks: DocChunk[];
  metadata: { version?: string; fetchedAt: string };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SourceAdapter {
  readonly sourceType: 'llms-txt' | 'github' | 'context7';
  fetch(config: LibraryConfig): Promise<Result<FetchResult>>;
  validate(result: FetchResult): ValidationResult;
}
