export const SUBSCRIPTION_STATUS = {
  INITIAL: 'INITIAL',
  CHECK: 'CHECK',
  CONFIRMED: 'CONFIRMED',
  PAUSED: 'PAUSED',
} as const;

export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];
