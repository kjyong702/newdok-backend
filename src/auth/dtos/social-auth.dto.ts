import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AUTH_PROVIDER } from '../constants/auth-provider';
import { AUTH_PLATFORM } from '../constants/auth-platform';

export class SocialAuthDto {
  @ApiProperty({
    enum: Object.values(AUTH_PROVIDER),
    example: AUTH_PROVIDER.KAKAO,
    description: '소셜 로그인 provider',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(Object.values(AUTH_PROVIDER))
  provider: string;

  @ApiProperty({
    enum: Object.values(AUTH_PLATFORM),
    example: AUTH_PLATFORM.IOS,
    description: '로그인을 수행한 클라이언트 플랫폼',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(Object.values(AUTH_PLATFORM))
  platform: string;

  @ApiProperty({
    example: 'eyJraWQiOi...',
    description: 'Provider SDK에서 발급된 OIDC identity token JWT',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiPropertyOptional({
    example: 'c1a2b3d4e5...',
    description:
      'Apple 로그인 시 SDK에서 발급된 authorization code. 전달하면 서버가 refresh token으로 교환해 보관하고, 탈퇴 시 Apple 로그인 연결 해제(revoke)에 사용합니다.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  authorizationCode?: string;
}
