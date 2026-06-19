/**
 * Standard SMM Panel API v2 client.
 *
 * The de-facto SMM panel API: a single POST endpoint that takes form-encoded
 * params including `key` (API key) and `action`. Implemented by the vast
 * majority of panels (Perfect Panel, SMMSocialMedia, etc.).
 *
 *   action=services -> list services
 *   action=balance  -> { balance, currency }
 *   action=add      -> { order } (provider order id)
 *   action=status   -> { charge, start_count, status, remains, currency }
 */

export interface SmmService {
  service: string | number;
  name: string;
  type?: string;
  category?: string;
  rate: string | number; // per 1000
  min: string | number;
  max: string | number;
  refill?: boolean;
  cancel?: boolean;
  [k: string]: unknown;
}

export interface SmmBalance {
  balance: string;
  currency: string;
}

export interface SmmAddResponse {
  order?: number | string;
  error?: string;
}

export interface SmmStatusResponse {
  charge?: string;
  start_count?: string;
  status?: string; // "Pending" | "In progress" | "Completed" | "Partial" | "Canceled" | ...
  remains?: string;
  currency?: string;
  error?: string;
}

export interface SmmCallResult<T> {
  ok: boolean;
  data: T | null;
  status: number;
  durationMs: number;
  error?: string;
  raw?: unknown;
}

export class SmmClient {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 20000,
  ) {}

  private async call<T>(
    params: Record<string, string | number>,
    timeoutMs = this.timeoutMs,
  ): Promise<SmmCallResult<T>> {
    const body = new URLSearchParams();
    body.set("key", this.apiKey);
    for (const [k, v] of Object.entries(params)) body.set(k, String(v));

    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(this.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: controller.signal,
        cache: "no-store",
      });
      const durationMs = Date.now() - started;
      const text = await res.text();
      let data: unknown = null;
      try {
        data = JSON.parse(text);
      } catch {
        return {
          ok: false,
          data: null,
          status: res.status,
          durationMs,
          error: `Non-JSON response: ${text.slice(0, 200)}`,
          raw: text,
        };
      }

      const errObj = (data as { error?: string })?.error;
      if (errObj) {
        return { ok: false, data: null, status: res.status, durationMs, error: errObj, raw: data };
      }

      return { ok: res.ok, data: data as T, status: res.status, durationMs, raw: data };
    } catch (err) {
      const durationMs = Date.now() - started;
      const message =
        err instanceof Error
          ? err.name === "AbortError"
            ? `Timed out after ${this.timeoutMs}ms`
            : err.message
          : "Unknown error";
      return { ok: false, data: null, status: 0, durationMs, error: message };
    } finally {
      clearTimeout(timeout);
    }
  }

  services() {
    // Large catalogues (tens of thousands of services) can take a while to
    // download — give this call a generous timeout so nothing is dropped.
    return this.call<SmmService[]>({ action: "services" }, 60_000);
  }

  balance() {
    return this.call<SmmBalance>({ action: "balance" });
  }

  async addOrder(opts: { service: string | number; link: string; quantity: number; runs?: number; interval?: number; comments?: string }) {
    const params: Record<string, string | number> = {
      action: "add",
      service: opts.service,
      link: opts.link,
    };
    // Custom-comments services take a newline-separated `comments` list instead
    // of a numeric quantity (quantity is implied by the number of comments).
    if (opts.comments && opts.comments.trim()) {
      params.comments = opts.comments;
    } else {
      params.quantity = opts.quantity;
    }
    if (opts.runs) params.runs = opts.runs;
    if (opts.interval) params.interval = opts.interval;

    // Retry transient network errors (fetch failed / timeout / 5xx) up to 3x.
    // A real provider rejection (error in JSON) is NOT retried.
    let last: SmmCallResult<SmmAddResponse> | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await this.call<SmmAddResponse>(params, 30000);
      // Success, or a definite provider rejection → return immediately.
      if (res.ok || (res.status >= 400 && res.status < 500 && res.data)) return res;
      last = res;
      // transient (status 0 = network/timeout, or 5xx) → wait and retry
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
    return last as SmmCallResult<SmmAddResponse>;
  }

  status(orderId: string | number) {
    return this.call<SmmStatusResponse>({ action: "status", order: orderId });
  }

  /** Lightweight connectivity check using the balance endpoint. */
  async ping(): Promise<SmmCallResult<SmmBalance>> {
    return this.balance();
  }
}

/** Normalize provider status strings to our OrderStatus enum values. */
export function mapProviderStatus(s?: string):
  | "PENDING"
  | "PROCESSING"
  | "PARTIAL"
  | "COMPLETED"
  | "CANCELED"
  | "FAILED"
  | "REFILLED" {
  const v = (s ?? "").toLowerCase();
  if (v.includes("complet")) return "COMPLETED";
  if (v.includes("partial")) return "PARTIAL";
  if (v.includes("cancel")) return "CANCELED";
  if (v.includes("progress") || v.includes("process")) return "PROCESSING";
  if (v.includes("refill")) return "REFILLED";
  if (v.includes("fail") || v.includes("error")) return "FAILED";
  return "PENDING";
}
