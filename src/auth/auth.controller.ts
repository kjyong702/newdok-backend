import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { KakaoAuthDto } from './dtos/kakao-auth.dto';
import { KakaoSignupDto } from './dtos/kakao-signup.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @ApiOperation({
    summary: 'SMS 인증번호 전송',
    description: '6자리 숫자 인증번호를 지정된 전화번호로 전송합니다.',
  })
  @ApiBody({
    schema: {
      properties: {
        phoneNumber: {
          type: 'string',
          description: '인증번호를 받을 전화번호',
          example: '01055039184',
        },
      },
    },
  })
  @Post('SMS')
  async sendSMS(@Body() body: Record<string, string>) {
    return this.authService.sendTwilioSMS(body.phoneNumber);
  }

  @ApiOperation({
    summary: '카카오 로그인/가입 시작',
    description:
      '카카오 authorization code로 사용자 정보를 조회하고, 기존 회원이면 로그인 처리하고 신규 회원이면 임시 회원가입 토큰을 발급합니다.',
  })
  @ApiBody({
    type: KakaoAuthDto,
  })
  @Post('kakao')
  async kakaoAuth(@Body() body: KakaoAuthDto) {
    return this.authService.kakaoAuth(body);
  }

  @ApiOperation({
    summary: '카카오 회원가입 완료',
    description:
      '카카오 인증 후 입력한 회원정보와 약관 동의 정보를 바탕으로 뉴독 회원가입을 완료합니다.',
  })
  @ApiBody({
    type: KakaoSignupDto,
  })
  @Post('kakao/signup')
  async kakaoSignup(@Body() body: KakaoSignupDto) {
    return this.authService.completeKakaoSignup(body);
  }
}
