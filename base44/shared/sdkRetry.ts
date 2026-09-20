// HOW A FUNCTION TALKS TO BASE44.
//
// Every function builds its SDK client with createClientFromRequest(req). The
// platform tells that client which host to call back for auth.me(), entities
// and integrations through the Base44-Api-Url header — and it fills that header
// with whatever host the app was opened on. The published app lives on
// adhdone.space, which sits behind Cloudflare's proxy, and Cloudflare answers a
// server-to-server call with a "Just a moment..." challenge page (HTTP 403,
// HTML body). So a function reached from the app could not even find out who
// was calling it: auth.me() threw, and the app saw a 500 (or a 401) from nearly
// every function it uses. The same functions worked when reached via base44.app,
// which has no proxy in front of it.
//
// platformRequest() is the fix: it hands createClientFromRequest a copy of the
// request whose Base44-Api-Url says base44.app, so the function's own calls
// never go near the proxy. Every function must build its client this way:
//
//   const base44 = createClientFromRequest(platformRequest(req));
//
// The copy carries only the headers. The body stays on the original request, so
// req.json() still works afterwards.
//
// withChallengeRetry() below predates platformRequest. It retries a call that
// hit the challenge page; with platformRequest in place the challenge cannot
// happen, so the retry is a harmless leftover, not a fix.

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

const PLATFORM_API = 'https://base44.app';

// A copy of the request that tells the SDK to call Base44 directly. Only the
// headers are copied; the body stays with the original request.
export function platformRequest(req: Request): Request {
  const headers = new Headers(req.headers);
  headers.set('Base44-Api-Url', PLATFORM_API);
  headers.delete('content-length');
  return new Request(req.url, { method: req.method, headers });
}
