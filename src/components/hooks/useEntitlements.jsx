import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export function useEntitlements() {
  const [entitlements, setEntitlements] = useState({
    premium: false,
    status: 'none',
    productId: null,
    trialEndsAt: null,
    expiresAt: null,
    autoRenew: false,
    loading: true,
  });

  const fetchEntitlements = async () => {
    try {
      const response = await base44.functions.invoke('iap/getEntitlements');
      setEntitlements({
        ...response.data.entitlements,
        loading: false,
      });
    } catch (error) {
      console.error('Failed to fetch entitlements:', error);
      setEntitlements(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    fetchEntitlements();
  }, []);

  return {
    ...entitlements,
    refresh: fetchEntitlements,
  };
}