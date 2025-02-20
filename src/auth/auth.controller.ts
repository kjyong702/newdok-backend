import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';

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
}
