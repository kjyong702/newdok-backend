import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { USER_CONSENT_TYPE } from '../constants/user-consent-type';

class KakaoSignupConsentDto {
  @ApiProperty({
    example: USER_CONSENT_TYPE.TERMS_OF_SERVICE,
    description: '약관 항목 타입',
  })
  @IsString()
  @IsNotEmpty()
  consentType: string;

  @ApiProperty({
    example: true,
    description: '필수 약관 여부',
  })
  @IsBoolean()
  isRequired: boolean;

  @ApiProperty({
    example: true,
    description: '동의 여부',
  })
  @IsBoolean()
  isAccepted: boolean;

  @ApiProperty({
    example: '2026-05-01',
    description: '약관 버전',
  })
  @IsString()
  @IsNotEmpty()
  consentVersion: string;
}

export class KakaoSignupDto {
  @ApiProperty({
    example: 'signup-jwt-token',
    description: '카카오 인증 후 발급된 임시 회원가입 토큰',
  })
  @IsString()
  @IsNotEmpty()
  signupToken: string;

  @ApiProperty({
    example: '뉴독이용자',
    description: '회원가입 시 입력한 닉네임',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  nickname: string;

  @ApiProperty({
    example: '1997',
    description: '출생연도',
  })
  @IsString()
  @IsNotEmpty()
  birthYear: string;

  @ApiProperty({
    example: '남자',
    description: '성별',
  })
  @IsString()
  @IsNotEmpty()
  gender: string;

  @ApiProperty({
    type: [KakaoSignupConsentDto],
    description: '회원가입 시 동의한 약관 항목 리스트',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => KakaoSignupConsentDto)
  consents: KakaoSignupConsentDto[];
}
