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
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}
