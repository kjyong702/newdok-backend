import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { USER_CONSENT_TYPE } from '../constants/user-consent-type';

class SocialSignupAgreementDto {
  @ApiProperty({
    example: USER_CONSENT_TYPE.TERMS_OF_SERVICE,
    description: '약관 항목 타입',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(Object.values(USER_CONSENT_TYPE))
  type: string;

  @ApiProperty({
    example: true,
    description: '동의 여부',
  })
  @IsBoolean()
  agreed: boolean;
}

export class SocialSignupDto {
  @ApiProperty({
    example: 'signup-jwt-token',
    description: '소셜 로그인 인증 후 발급된 임시 회원가입 토큰',
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
    type: [SocialSignupAgreementDto],
    description: '회원가입 시 동의한 약관 항목 리스트',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SocialSignupAgreementDto)
  agreements: SocialSignupAgreementDto[];
}
