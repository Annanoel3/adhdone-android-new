// Device de-duplication for OneSignal player IDs.
//
// Every app reinstall / cleared-data / new-build install creates a BRAND NEW
// OneSignal subscription record for the SAME physical phone, and the old record
// stays "subscribed". Because pushes were targeted at include_player_ids, one
// send turned into one notification per stale record — which is exactly how an
// announcement about fixing duplicates arrived twice on the same screen.
//
// Fix: keep only the most recently active subscription per physical device
// (fingerprinted by model + OS + type) and drop anything OneSignal reports as
// invalid or unsubscribed. Genuinely different devices (phone + tablet) survive.

type Player = {
  id: string;
  device_model?: string;
  device_os?: string;
  device_type?: number;
  notification_types?: number;
  invalid_identifier?: boolean;
  last_active?: number;
};

async function fetchPlayer(id: string, appId: string, restKey: string): Promise<Player | null> {
  try {
    const res = await fetch(`https://onesignal.com/api/v1/players/${id}?app_id=${appId}`, {
      headers: { Authorization: `Basic ${restKey}` },
    });
    if (!res.ok) return null;
    const p = await res.json();
    return p && p.id ? p : null;
  } catch {
    return null;
  }
}

/**
 * Returns the subset of playerIds that should actually receive pushes:
 * one live subscription per physical device. On any API trouble the input list
 * is returned unchanged — never silently drop every device.
 */
export async function dedupeDevices(playerIds: string[]): Promise<string[]> {
  const ids = Array.from(new Set((playerIds || []).filter(Boolean)));
  if (ids.length <= 1) return ids;

  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const restKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();
  if (!appId || !restKey) return ids;

  const players = await Promise.all(ids.map((id) => fetchPlayer(id, appId, restKey)));

  const live: Player[] = [];
  for (let i = 0; i < ids.length; i++) {
    const p = players[i];
    if (!p) continue;                                   // unknown to OneSignal — can't verify, see fallback below
    if (p.invalid_identifier) continue;                 // dead token
    if (typeof p.notification_types === 'number' && p.notification_types <= 0) continue; // unsubscribed
    live.push({ ...p, id: ids[i] });
  }
  if (live.length === 0) return ids;                    // verification failed wholesale — keep what we had

  // One winner per physical device: the most recently active subscription.
  const best: Record<string, Player> = {};
  for (const p of live) {
    const key = `${p.device_type ?? ''}|${p.device_model ?? ''}|${p.device_os ?? ''}`;
    const current = best[key];
    if (!current || (p.last_active || 0) > (current.last_active || 0)) best[key] = p;
  }
  return Object.values(best).map((p) => p.id);
}