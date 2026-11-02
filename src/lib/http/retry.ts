export class HttpError extends Error {
  readonly status: number;
  readonly body?: string;

  constructor(status: number, message: string, body?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export class RetryExhaustedError extends Error {
  readonly attempts: number;
  readonly cause: unknown;

  constructor(attempts: number, cause: unknown) {
    super(`Retry exhausted after ${attempts} attempt(s): ${(cause as Error)?.message ?? String(cause)}`);
    this.name = 'RetryExhaustedError';
    this.attempts = attempts;
    this.cause = cause;
  }
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false to fail fast (e.g. 400/401 from a downstream API). */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  sleepFn?: (ms: number) => Promise<void>;
  random?: () => number;
}

export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
  }
  // Network failures, DNS errors, timeouts (AbortError) are worth retrying.
  return true;
}

/**
 * Exponential backoff with full jitter:
 *   delay = random(0.5, 1) * min(maxDelay, base * 2^(attempt-1))
 */
export async function withRetry<T>(
  task: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<{ result: T; attempts: number }> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 4000;
  const sleepFn = options.sleepFn ?? sleep;
  const random = options.random ?? Math.random;
  const shouldRetry = options.shouldRetry ?? ((error: unknown) => isRetryable(error));

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await task(attempt);
      return { result, attempts: attempt };
    } catch (error) {
      lastError = error;
      const isLast = attempt === attempts;
      if (isLast || !shouldRetry(error, attempt)) break;

      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delay = Math.round(exponential * (0.5 + random() * 0.5));
      options.onRetry?.(error, attempt, delay);
      await sleepFn(delay);
    }
  }

  throw new RetryExhaustedError(attempts, lastError);
}
