import { Controller, Post, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
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
  @ApiOkResponse({
    description:
      '기존 회원이면 서비스 accessToken을 반환하고, 신규 회원이면 회원가입 완료에 사용할 signupToken을 반환합니다.',
    schema: {
      examples: {
        registered: {
          summary: '기존 회원 로그인 성공',
          value: {
            isRegistered: true,
            accessToken: 'newdok-access-token',
            user: {
              id: 1,
              loginId: null,
              phoneNumber: null,
              subscribeEmail: 'newdok101@newdok.store',
              nickname: '뉴독이용자',
              birthYear: '1997',
              gender: '남자',
              createdAt: '2026-06-29T00:00:00.000Z',
              industryId: null,
              interests: [],
            },
          },
        },
        unregistered: {
          summary: '신규 회원가입 필요',
          value: {
            isRegistered: false,
            signupToken: 'temporary-social-signup-token',
            profile: {
              provider: 'KAKAO',
              providerUserId: '123456789',
              email: null,
              nickname: '카카오닉네임',
            },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: '요청 body가 올바르지 않거나 지원하지 않는 provider/platform인 경우',
    schema: {
      example: {
        statusCode: 400,
        message: 'provider must be one of the following values: KAKAO, APPLE',
        error: 'Bad Request',
        path: '/auth/social-login',
        timestamp: '2026-06-29T00:00:00.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'provider idToken이 유효하지 않거나 탈퇴한 계정인 경우',
    schema: {
      example: {
        statusCode: 401,
        message: '카카오 idToken이 유효하지 않습니다.',
        error: 'Unauthorized',
        path: '/auth/social-login',
        timestamp: '2026-06-29T00:00:00.000Z',
      },
    },
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
  @ApiOkResponse({
    description: '소셜 회원가입 완료 및 서비스 accessToken 반환',
    schema: {
      example: {
        isRegistered: true,
        accessToken: 'newdok-access-token',
        user: {
          id: 1,
          loginId: null,
          phoneNumber: null,
          subscribeEmail: 'newdok101@newdok.store',
          nickname: '뉴독이용자',
          birthYear: '1997',
          gender: '남자',
          createdAt: '2026-06-29T00:00:00.000Z',
          industryId: null,
          interests: [],
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: '약관 동의 항목이 누락/중복되었거나 필수 약관에 동의하지 않은 경우',
    schema: {
      example: {
        statusCode: 400,
        message: '필수 약관 동의가 필요합니다.',
        error: 'Bad Request',
        path: '/auth/social-login/signup',
        timestamp: '2026-06-29T00:00:00.000Z',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'signupToken이 유효하지 않거나 탈퇴한 계정인 경우',
    schema: {
      example: {
        statusCode: 401,
        message: '회원가입 토큰이 유효하지 않습니다.',
        error: 'Unauthorized',
        path: '/auth/social-login/signup',
        timestamp: '2026-06-29T00:00:00.000Z',
      },
    },
  })
  @ApiServiceUnavailableResponse({
    description: '회원가입용 구독 이메일 계정이 부족하거나 생성이 지연되는 경우',
    schema: {
      example: {
        statusCode: 503,
        message: '사용 가능한 구독 이메일이 없습니다. 관리자에게 문의해주세요.',
        error: 'Service Unavailable',
        path: '/auth/social-login/signup',
        timestamp: '2026-06-29T00:00:00.000Z',
      },
    },
  })
  @Post('social-login/signup')
  async socialSignup(@Body() body: SocialSignupDto) {
    return this.authService.completeSocialSignup(body);
  }
}
