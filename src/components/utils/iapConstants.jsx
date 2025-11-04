export const IAP_PRODUCTS = {
  MONTHLY: process.env.IAP_MONTHLY_ID || 'adhdone_premium_monthly',
  YEARLY: process.env.IAP_YEARLY_ID || 'adhdone_premium_yearly',
};

export const TRIAL_DAYS = 5;

export const ENTITLEMENT_STATUS = {
  TRIAL: 'trial',
  ACTIVE: 'active',
  GRACE: 'grace',
  PAUSED: 'paused',
  EXPIRED: 'expired',
  REFUNDED: 'refunded',
  REVOKED: 'revoked',
};