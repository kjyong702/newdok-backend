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

  it('refresh token을 암호화하고 복호화한다', () => {
    const refreshToken = 'apple-refresh-token';
    const encrypted = (service as any).encryptRefreshToken(refreshToken);
    const decrypted = (service as any).decryptRefreshToken(encrypted);

    expect(encrypted).not.toBe(refreshToken);
    expect(decrypted).toBe(refreshToken);
  });
});
