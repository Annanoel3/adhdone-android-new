// Subscription gating removed - all features are freely accessible
export async function checkAccess() {
  return { hasAccess: true, reason: 'open_access' };
}