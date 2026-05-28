export const AUTH_PROVIDER = {
  KAKAO: 'KAKAO',
} as const;

export type AuthProvider = (typeof AUTH_PROVIDER)[keyof typeof AUTH_PROVIDER];
