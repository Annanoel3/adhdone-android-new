// The platform API sometimes answers a function's own SDK call with a
// Cloudflare "Just a moment..." interstitial (HTTP 403, HTML body) instead of
// JSON. It's transient and has nothing to do with permissions — but it made
// auth.me() throw, which the Google Calendar functions surfaced to the app as a
// bare 500. Retry those calls a couple of times before giving up.

function isChallenge(error) {
  const status = error?.response?.status ?? error?.status;
  if (status !== 403) return false;
  let body = '';
  try { body = String(error?.response?.data ?? error?.data ?? ''); } catch { body = ''; }
  return body.includes('Just a moment') || body.includes('cf-browser-verification') || body.includes('<!DOCTYPE html');
}

// Runs fn, retrying only when the failure is a bot-challenge response.
export async function withChallengeRetry(fn, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (!isChallenge(error)) throw error;
      lastError = error;
      console.log(`[sdkRetry] platform API returned a bot challenge, retrying (${i + 1}/${attempts})`);
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw lastError;
}