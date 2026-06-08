import { AdapterError, type Result, ok, err, RETRY_BASE_MS } from '@offlinedocs/shared';

function computeDelay(attempt: number): number {
  const base = RETRY_BASE_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 400 - 200;
  return Math.max(0, base + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503;
}

function isNonRetryableClientError(status: number): boolean {
  return status === 401 || status === 403;
}

export async function fetchWithRetry(
  url: string,
  maxRetries: number,
  libraryId: string,
): Promise<Result<Response>> {
  let lastError: Error | undefined;
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return ok(response);
      }

      // Consume body to release the underlying socket
      await response.body?.cancel();

      if (isNonRetryableClientError(response.status)) {
        return err(
          new AdapterError('AUTH_REQUIRED', libraryId, `HTTP ${response.status} for ${url}`, undefined, response.status),
        );
      }

      if (!isRetryableStatus(response.status)) {
        return err(
          new AdapterError('NETWORK', libraryId, `HTTP ${response.status} for ${url}`, undefined, response.status),
        );
      }

      lastStatus = response.status;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (cause) {
      lastError = cause instanceof Error ? cause : new Error(String(cause));
    }

    if (attempt < maxRetries) {
      await sleep(computeDelay(attempt));
    }
  }

  const code = lastStatus === 429 ? 'RATE_LIMITED' : 'NETWORK';
  return err(
    new AdapterError(code, libraryId, `Failed after ${maxRetries + 1} attempts: ${lastError?.message ?? 'unknown error'}`, lastError),
  );
}
