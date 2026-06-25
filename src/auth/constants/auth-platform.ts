export const AUTH_PLATFORM = {
  IOS: 'IOS',
  ANDROID: 'ANDROID',
  WEB: 'WEB',
} as const;

export type AuthPlatform =
  (typeof AUTH_PLATFORM)[keyof typeof AUTH_PLATFORM];
