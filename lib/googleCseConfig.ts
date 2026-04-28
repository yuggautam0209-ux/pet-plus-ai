/** Resolves Google Programmable Search (Custom Search JSON API) credentials. */
export function getGoogleCseCredentials(): { apiKey: string; cx: string } {
  const apiKey = (process.env.GOOGLE_CSE_API_KEY ?? "").trim();
  const cx = (
    process.env.GOOGLE_CSE_ID ??
    process.env.GOOGLE_SEARCH_ENGINE_ID ??
    ""
  ).trim();
  return { apiKey, cx };
}

export function hasGoogleCseCredentials(): boolean {
  const { apiKey, cx } = getGoogleCseCredentials();
  return Boolean(apiKey && cx);
}
