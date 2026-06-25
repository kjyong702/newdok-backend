import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { SocialAuthDto } from './dtos/social-auth.dto';
import { SocialSignupDto } from './dtos/social-signup.dto';

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
    summary: '소셜 로그인/가입 시작',
    description:
      'Provider 인증 정보를 검증하고, 기존 회원이면 로그인 처리하고 신규 회원이면 임시 회원가입 토큰을 발급합니다.',
  })
  @ApiBody({
    type: SocialAuthDto,
  })
  @Post('social-login')
  async socialAuth(@Body() body: SocialAuthDto) {
    return this.authService.socialAuth(body);
  }

  @ApiOperation({
    summary: '소셜 회원가입 완료',
    description:
      '소셜 인증 후 입력한 회원정보와 약관 동의 정보를 바탕으로 뉴독 회원가입을 완료합니다.',
  })
  @ApiBody({
    type: SocialSignupDto,
  })
  @Post('social-login/signup')
  async socialSignup(@Body() body: SocialSignupDto) {
    return this.authService.completeSocialSignup(body);
  }
}
