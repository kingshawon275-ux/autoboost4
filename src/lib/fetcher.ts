export async function apiFetch<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error("Network error — please check your connection.");
  }

  const text = await res.text();

  // Try to parse JSON; if the server returned HTML (login redirect, 502/503,
  // error page) JSON.parse would throw a raw "Unexpected token <" error.
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON response.
      if (res.status === 401 || res.status === 403) {
        throw new Error("Your session expired. Please reload and sign in again.");
      }
      throw new Error(
        res.status >= 500
          ? "Server is busy, please try again."
          : "Unexpected server response. Please reload.",
      );
    }
  }

  if (!res.ok) {
    const errMsg =
      data && typeof data === "object"
        ? (data as { error?: string }).error
        : undefined;
    throw new Error(errMsg || `Request failed (${res.status})`);
  }
  return data as T;
}
