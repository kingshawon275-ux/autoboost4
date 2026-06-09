/**
 * Retry a DB operation on MongoDB write conflicts / transient transaction
 * errors. These happen when concurrent writers (e.g. the background scheduler
 * and a manual sync) touch the same document at once.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
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
      // Exponential backoff with generous jitter so many concurrent writers on
      // the same document (e.g. 4 orders decrementing one panel's balance) don't
      // keep colliding — they spread out and each succeeds.
      const base = Math.min(1500, 100 * 2 ** i);
      await new Promise((r) => setTimeout(r, base + Math.random() * base));
    }
  }
  throw lastErr;
}
