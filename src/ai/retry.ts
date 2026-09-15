const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
]);

type ErrorWithStatus = Error & {
  status?: number;
  code?: string;
  cause?: unknown;
};

export type RetryOptions = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  onRetry?: (error: unknown, nextAttempt: number, delayMs: number) => void;
};

const errorDetails = (error: unknown): ErrorWithStatus | undefined =>
  error instanceof Error ? (error as ErrorWithStatus) : undefined;

const statusFromMessage = (message: string): number | undefined => {
  const match = message.match(/(?:\[|status(?: code)?\s*[:=]?\s*)(\d{3})(?:\s|\]|$)/i);
  return match ? Number(match[1]) : undefined;
};

export function isRetryableGeminiError(error: unknown): boolean {
  const details = errorDetails(error);
  if (!details) return false;

  const status = details.status ?? statusFromMessage(details.message);
  if (status !== undefined && RETRYABLE_HTTP_STATUSES.has(status)) return true;
  if (details.code && RETRYABLE_NETWORK_CODES.has(details.code)) return true;

  return details.cause !== undefined && isRetryableGeminiError(details.cause);
}

export async function retryWithBackoff<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts));
  const baseDelayMs = Math.max(0, options.baseDelayMs);
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const sleep = options.sleep ?? ((delayMs) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const random = options.random ?? Math.random;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts || !isRetryableGeminiError(error)) throw error;

      const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = Math.round(exponentialDelay * (0.75 + random() * 0.5));
      options.onRetry?.(error, attempt + 1, delayMs);
      await sleep(delayMs);
    }
  }

  throw new Error("Retry loop terminou inesperadamente");
}
