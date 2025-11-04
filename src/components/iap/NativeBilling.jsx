// Native billing bridge interface
// This must be implemented in the native app layer

export const NativeBilling = {
  isSupported: async () => {
    if (typeof window === 'undefined') return false;
    return window.adhdone?.billing?.isSupported?.() || false;
  },

  getProducts: async (productIds) => {
    if (!window.adhdone?.billing?.getProducts) {
      throw new Error('Native billing not available');
    }
    return await window.adhdone.billing.getProducts(productIds);
  },

  purchase: async (productId, appAccountToken) => {
    if (!window.adhdone?.billing?.purchase) {
      throw new Error('Native billing not available');
    }
    return await window.adhdone.billing.purchase(productId, appAccountToken);
  },

  restore: async () => {
    if (!window.adhdone?.billing?.restore) {
      throw new Error('Native billing not available');
    }
    return await window.adhdone.billing.restore();
  },
};