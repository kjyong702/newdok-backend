import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AUTH_PROVIDER } from '../constants/auth-provider';
import { AUTH_PLATFORM } from '../constants/auth-platform';

class SocialAuthCredentialDto {
  @ApiPropertyOptional({
    example: 'authorization-code-from-provider',
    description: 'Provider 로그인 후 발급된 authorization code',
  })
  @IsOptional()
  @IsString()
  authorizationCode?: string;

  @ApiPropertyOptional({
    example: 'eyJraWQiOi...',
    description: 'OIDC provider에서 발급된 identity token JWT',
  })
  @IsOptional()
  @IsString()
  idToken?: string;

  @ApiPropertyOptional({
    example: 'provider-access-token',
    description: 'Provider SDK에서 발급된 access token',
  })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({
    example: 'newdok://oauth/kakao',
    description: 'Provider 개발자 콘솔에 등록된 redirect URI',
  })
  @IsOptional()
  @IsString()
  redirectUri?: string;

  @ApiPropertyOptional({
    example: 'pkce-code-verifier',
    description: 'PKCE 플로우 사용 시 code verifier',
  })
  @IsOptional()
  @IsString()
  codeVerifier?: string;

  @ApiPropertyOptional({
    example: 'nonce-value',
    description: 'OIDC nonce 검증이 필요한 경우 전달하는 nonce',
  })
  @IsOptional()
  @IsString()
  nonce?: string;
}

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
    type: SocialAuthCredentialDto,
    description:
      'Provider/platform 조합에 따라 필요한 인증 값. Kakao code 플로우는 authorizationCode+redirectUri, Kakao SDK는 accessToken, Apple은 authorizationCode+idToken을 사용합니다.',
  })
  @ValidateNested()
  @Type(() => SocialAuthCredentialDto)
  credential: SocialAuthCredentialDto;
}
