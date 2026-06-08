export type AdapterErrorCode =
  | 'NETWORK'
  | 'AUTH_REQUIRED'
  | 'RATE_LIMITED'
  | 'FORMAT_CHANGED'
  | 'EMPTY_RESPONSE'
  | 'CONFIG_INVALID';

export class AdapterError extends Error {
  constructor(
    public readonly code: AdapterErrorCode,
    public readonly libraryId: string,
    message: string,
    cause?: Error,
    public readonly statusCode?: number,
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AdapterError';
  }
}
