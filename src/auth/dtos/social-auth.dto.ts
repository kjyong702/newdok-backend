import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, IsUrl, ValidateIf } from 'class-validator';
import { AUTH_PROVIDER } from '../constants/auth-provider';
import { AUTH_PLATFORM } from '../constants/auth-platform';

// 카카오 웹은 idToken 대신 인가 코드와 redirectUri를 받아 서버가 토큰을 교환한다.
const isKakaoWeb = (dto: SocialAuthDto) =>
  dto.provider === AUTH_PROVIDER.KAKAO && dto.platform === AUTH_PLATFORM.WEB;

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

  @ApiPropertyOptional({
    example: 'eyJraWQiOi...',
    description:
      'Provider SDK에서 발급된 OIDC identity token JWT. 카카오 웹(KAKAO + WEB)을 제외한 모든 요청에서 필수입니다.',
  })
  @ValidateIf((dto: SocialAuthDto) => !isKakaoWeb(dto))
  @IsString()
  @IsNotEmpty()
  idToken?: string;

  @ApiPropertyOptional({
    example: 'c1a2b3d4e5...',
    description: [
      '- 카카오 웹: 필수. 카카오 로그인 후 redirectUri로 전달된 인가 코드(code). 서버가 REST API 키로 토큰을 교환합니다.',
      '- Apple(iOS/웹): 선택. 전달하면 서버가 refresh token으로 교환해 보관하고, 탈퇴 시 Apple 로그인 연결 해제(revoke)에 사용합니다.',
    ].join('\n'),
  })
  @ValidateIf(
    (dto: SocialAuthDto) =>
      isKakaoWeb(dto) || dto.authorizationCode !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  authorizationCode?: string;

  @ApiPropertyOptional({
    example: 'http://localhost:3000/login',
    description: [
      '- 카카오 웹: 필수. 인가 코드 요청에 사용한 redirect_uri와 정확히 같은 값(카카오 디벨로퍼스에 등록된 Redirect URI).',
      '- Apple 웹: authorizationCode를 보낼 때 함께 전달. AppleID.auth.init의 redirectURI와 같은 값이어야 refresh token 교환에 성공합니다.',
      '- 앱(iOS/AOS): 보내지 않습니다.',
    ].join('\n'),
  })
  @ValidateIf(
    (dto: SocialAuthDto) => isKakaoWeb(dto) || dto.redirectUri !== undefined,
  )
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  redirectUri?: string;
}
