/**
 * Abortable fetch so upstream slowness never blocks the search route for long
 * (falls back to DuckDuckGo HTML path quickly when Google CSE is slow).
 */
export async function fetchWithTimeout(
  input: string | URL,
  init: Omit<RequestInit, "signal"> | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
