// Entitlements disabled - all features are freely accessible
export function useEntitlements() {
  return {
    premium: true,
    status: 'active',
    productId: null,
    trialEndsAt: null,
    expiresAt: null,
    autoRenew: false,
    loading: false,
    refresh: () => {},
  };
}