import {
  BadRequestException,
  InternalServerErrorException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDecipheriv } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  createRemoteJWKSet,
  importPKCS8,
  jwtVerify,
  KeyLike,
  SignJWT,
} from 'jose';
import { AUTH_PLATFORM } from './constants/auth-platform';

type AppleIdentity = {
  providerUserId: string;
  email: string | null;
};

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
);

@Injectable()
export class AppleAuthService {
  private privateKeyPromise?: Promise<KeyLike>;

  constructor(private configService: ConfigService) {}

  async authenticate(
    identityToken: string,
    platform: string,
  ) {
    const clientId = this.getClientId(platform);
    const identity = await this.verifyIdentityToken(identityToken, clientId);

    return {
      providerUserId: identity.providerUserId,
      email: identity.email,
    };
  }

  async revokeRefreshToken(
    refreshTokenEncrypted: string,
    providerClientId: string,
  ) {
    const clientSecret = await this.createClientSecret(providerClientId);
    const response = await fetch('https://appleid.apple.com/auth/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: new URLSearchParams({
        client_id: providerClientId,
        client_secret: clientSecret,
        token: this.decryptRefreshToken(refreshTokenEncrypted),
        token_type_hint: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ServiceUnavailableException(
        `Apple 로그인 연결 해제에 실패했습니다. ${errorText}`,
      );
    }
  }

  getClientId(platform: string) {
    if (platform === AUTH_PLATFORM.WEB) {
      return this.getRequiredEnvValue(
        'APPLE_WEB_CLIENT_ID',
        'Apple Web Client ID 설정이 누락되었습니다.',
      );
    }

    if (platform === AUTH_PLATFORM.IOS) {
      return (
        this.configService.get<string>('APPLE_IOS_CLIENT_ID') ??
        this.getRequiredEnvValue(
          'APPLE_CLIENT_ID',
          'Apple Client ID 설정이 누락되었습니다.',
        )
      );
    }

    throw new BadRequestException(
      'Apple 로그인은 현재 iOS 또는 Web 플랫폼만 지원합니다.',
    );
  }

  private async verifyIdentityToken(
    identityToken: string,
    clientId: string,
  ): Promise<AppleIdentity> {
    try {
      const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
        issuer: APPLE_ISSUER,
        audience: clientId,
        algorithms: ['RS256'],
      });

      if (!payload.sub) {
        throw new UnauthorizedException(
          'Apple 사용자 식별값을 확인할 수 없습니다.',
        );
      }

      return {
        providerUserId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : null,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException(
        'Apple identity token이 유효하지 않습니다.',
      );
    }
  }

  private async createClientSecret(clientId: string) {
    const teamId = this.getRequiredEnvValue(
      'APPLE_TEAM_ID',
      'Apple Team ID 설정이 누락되었습니다.',
    );
    const keyId = this.getRequiredEnvValue(
      'APPLE_KEY_ID',
      'Apple Key ID 설정이 누락되었습니다.',
    );
    const privateKey = await this.getPrivateKey();

    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: keyId })
      .setIssuer(teamId)
      .setSubject(clientId)
      .setAudience(APPLE_ISSUER)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  }

  private getPrivateKey() {
    if (!this.privateKeyPromise) {
      const privateKeyBase64 = this.configService.get<string>(
        'APPLE_PRIVATE_KEY_BASE64',
      );
      const privateKeyPath = this.configService.get<string>(
        'APPLE_PRIVATE_KEY_PATH',
      );
      let privateKey: string;

      if (privateKeyBase64) {
        privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
      } else if (privateKeyPath) {
        privateKey = fs.readFileSync(path.resolve(privateKeyPath), 'utf8');
      } else {
        throw new InternalServerErrorException(
          'Apple Private Key 설정이 누락되었습니다.',
        );
      }

      this.privateKeyPromise = importPKCS8(privateKey, 'ES256');
    }

    return this.privateKeyPromise;
  }

  private decryptRefreshToken(encryptedRefreshToken: string) {
    try {
      const [iv, authTag, encrypted] = encryptedRefreshToken
        .split('.')
        .map((value) => Buffer.from(value, 'base64'));
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.getEncryptionKey(),
        iv,
      );
      decipher.setAuthTag(authTag);

      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException(
        'Apple refresh token을 복호화할 수 없습니다.',
      );
    }
  }

  private getEncryptionKey() {
    const encodedKey = this.getRequiredEnvValue(
      'PROVIDER_TOKEN_ENCRYPTION_KEY',
      '소셜 로그인 토큰 암호화 키 설정이 누락되었습니다.',
    );
    const key = Buffer.from(encodedKey, 'base64');

    if (key.length !== 32) {
      throw new InternalServerErrorException(
        '소셜 로그인 토큰 암호화 키는 32바이트 Base64 값이어야 합니다.',
      );
    }

    return key;
  }

  private getRequiredEnvValue(key: string, message: string) {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new InternalServerErrorException(message);
    }

    return value;
  }
}
