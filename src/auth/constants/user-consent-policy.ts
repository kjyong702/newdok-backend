import { USER_CONSENT_TYPE } from './user-consent-type';

export const USER_CONSENT_POLICY = {
  [USER_CONSENT_TYPE.AGE_CONFIRMATION_OVER_14]: {
    isRequired: true,
    version: '2026-06-01',
  },
  [USER_CONSENT_TYPE.TERMS_OF_SERVICE]: {
    isRequired: true,
    version: '2026-06-01',
  },
  [USER_CONSENT_TYPE.PERSONAL_INFORMATION_COLLECTION_AND_USE]: {
    isRequired: true,
    version: '2026-06-01',
  },
  [USER_CONSENT_TYPE.MARKETING_INFORMATION_RECEIPT]: {
    isRequired: false,
    version: '2026-06-01',
  },
} as const;
