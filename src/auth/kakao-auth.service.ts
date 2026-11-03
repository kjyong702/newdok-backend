import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KakaoAuthService {
  constructor(private configService: ConfigService) {}

  // 웹 로그인: 웹이 받은 인가 코드를 REST API 키(+Client Secret)로 교환해 OIDC idToken을 받는다.
  async exchangeAuthorizationCode(
    authorizationCode: string,
    redirectUri: string,
  ) {
    const restApiKey = this.getRequiredEnvValue(
      'KAKAO_REST_API_KEY',
      '카카오 REST API 키 설정이 누락되었습니다.',
    );
    const clientSecret = this.configService.get<string>('KAKAO_CLIENT_SECRET');
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: restApiKey,
      redirect_uri: redirectUri,
      code: authorizationCode,
    });

    if (clientSecret) {
      params.set('client_secret', clientSecret);
    }

    const response = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: params,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new UnauthorizedException(
        `카카오 인가 코드 교환에 실패했습니다. ${errorText}`,
      );
    }

    const tokens = (await response.json()) as { id_token?: string };

    if (!tokens.id_token) {
      throw new UnauthorizedException(
        '카카오 토큰 응답에 idToken이 없습니다. OpenID Connect 활성화 여부와 scope에 openid가 포함됐는지 확인해주세요.',
      );
    }

    return tokens.id_token;
  }

  async unlinkUser(providerUserId: string) {
    const adminKey = this.getRequiredEnvValue(
      'KAKAO_ADMIN_KEY',
      '카카오 Admin Key 설정이 누락되었습니다.',
    );

    const response = await fetch('https://kapi.kakao.com/v1/user/unlink', {
      method: 'POST',
      headers: {
        Authorization: `KakaoAK ${adminKey}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: new URLSearchParams({
        target_id_type: 'user_id',
        target_id: providerUserId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ServiceUnavailableException(
        `카카오 계정 연결 해제에 실패했습니다. ${errorText}`,
      );
    }
  }

  private getRequiredEnvValue(key: string, message: string) {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new InternalServerErrorException(message);
    }

    return value;
  }
}
