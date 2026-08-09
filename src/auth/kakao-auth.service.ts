import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KakaoAuthService {
  constructor(private configService: ConfigService) {}

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
