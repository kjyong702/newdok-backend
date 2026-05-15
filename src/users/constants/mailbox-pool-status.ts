export const MAILBOX_POOL_STATUS = {
  AVAILABLE: 'AVAILABLE',
  ASSIGNED: 'ASSIGNED',
} as const;

export type MailboxPoolStatus =
  (typeof MAILBOX_POOL_STATUS)[keyof typeof MAILBOX_POOL_STATUS];
