import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, serverUrl, token, functionsVersion, appBaseUrl } = appParams;

// The app talks to Base44 at base44.app on purpose (Anna's design). It keeps
// the app working if the custom domain ever lapses, and it keeps the backend
// functions' own calls back into Base44 away from the Cloudflare proxy in
// front of adhdone.space, which answers server-to-server calls with a bot
// check ("Just a moment...", HTTP 403) and took down every function the app
// calls. serverUrl comes from app-params: the build's VITE_BASE44_BACKEND_URL
// (https://base44.app), or the server_url the editor preview passes in.
// Never set it to '' — that means "whatever domain the app was opened on".
export const base44 = createClient({
  appId,
  serverUrl: serverUrl || 'https://base44.app',
  token,
  functionsVersion,
  requiresAuth: false,
  appBaseUrl
});
