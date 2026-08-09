import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import { AppleAuthService } from './apple-auth.service';

describe('AppleAuthService', () => {
  const privateKey = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
  }).privateKey;
  const config = new Map<string, string>([
    ['APPLE_TEAM_ID', 'TEST_TEAM_ID'],
    ['APPLE_KEY_ID', 'TEST_KEY_ID'],
    ['APPLE_CLIENT_ID', 'com.newdok.test'],
    ['APPLE_PRIVATE_KEY_BASE64', Buffer.from(privateKey).toString('base64')],
    ['PROVIDER_TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 1).toString('base64')],
  ]);
  const configService = {
    get: jest.fn((key: string) => config.get(key)),
  } as unknown as ConfigService;
  const service = new AppleAuthService(configService);

  it('Apple client secret에 설정된 식별값을 포함한다', async () => {
    const token = await (service as any).createClientSecret('com.newdok.test');
    const header = decodeProtectedHeader(token);
    const payload = decodeJwt(token);

    expect(header).toMatchObject({ alg: 'ES256', kid: 'TEST_KEY_ID' });
    expect(payload).toMatchObject({
      iss: 'TEST_TEAM_ID',
      sub: 'com.newdok.test',
      aud: 'https://appleid.apple.com',
    });
  });

  it('iOS 플랫폼의 Apple client id를 반환한다', () => {
    expect(service.getClientId('IOS')).toBe('com.newdok.test');
  });

  it('refresh token을 암호화한 값은 복호화하면 원문과 같다', () => {
    const encrypted = (service as any).encryptRefreshToken(
      'apple-refresh-token',
    );

    expect(encrypted).not.toContain('apple-refresh-token');
    expect((service as any).decryptRefreshToken(encrypted)).toBe(
      'apple-refresh-token',
    );
  });

  describe('exchangeAuthorizationCode', () => {
    let fetchMock: jest.SpyInstance;

    const createFakeIdToken = (sub: string) => {
      const encode = (value: object) =>
        Buffer.from(JSON.stringify(value)).toString('base64url');

      return `${encode({ alg: 'RS256' })}.${encode({ sub })}.signature`;
    };

    afterEach(() => {
      fetchMock?.mockRestore();
    });

    it('authorization code를 교환해 암호화된 refresh token을 반환한다', async () => {
      fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          refresh_token: 'apple-refresh-token',
          id_token: createFakeIdToken('apple-user-1'),
        }),
      } as Response);

      const credential = await service.exchangeAuthorizationCode(
        'auth-code',
        'IOS',
      );

      expect(credential.providerClientId).toBe('com.newdok.test');
      expect(credential.providerUserId).toBe('apple-user-1');
      expect(
        (service as any).decryptRefreshToken(
          credential.providerRefreshTokenEncrypted,
        ),
      ).toBe('apple-refresh-token');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const params = init.body as URLSearchParams;

      expect(url).toBe('https://appleid.apple.com/auth/token');
      expect(params.get('grant_type')).toBe('authorization_code');
      expect(params.get('code')).toBe('auth-code');
      expect(params.get('client_id')).toBe('com.newdok.test');
    });

    it('Apple 토큰 교환에 실패하면 UnauthorizedException을 던진다', async () => {
      fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        text: async () => '{"error":"invalid_grant"}',
      } as Response);

      await expect(
        service.exchangeAuthorizationCode('bad-code', 'IOS'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('토큰 응답에 refresh token이 없으면 UnauthorizedException을 던진다', async () => {
      fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response);

      await expect(
        service.exchangeAuthorizationCode('auth-code', 'IOS'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
