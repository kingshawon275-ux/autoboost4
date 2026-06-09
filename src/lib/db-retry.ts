/**
 * Retry a DB operation on MongoDB write conflicts / transient transaction
 * errors. These happen when concurrent writers (e.g. the background scheduler
 * and a manual sync) touch the same document at once.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable =
        msg.includes("write conflict") ||
        msg.includes("WriteConflict") ||
        msg.includes("deadlock") ||
        msg.includes("Please retry");
      if (!retryable || i === attempts - 1) throw err;
      // small backoff with jitter
      await new Promise((r) => setTimeout(r, 80 * (i + 1) + Math.random() * 60));
    }
  }
  throw lastErr;
}
