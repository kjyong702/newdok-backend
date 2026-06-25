export const AUTH_PROVIDER = {
  KAKAO: 'KAKAO',
  APPLE: 'APPLE',
} as const;

export type AuthProvider = (typeof AUTH_PROVIDER)[keyof typeof AUTH_PROVIDER];
