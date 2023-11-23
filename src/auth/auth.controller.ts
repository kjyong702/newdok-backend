import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @ApiOperation({
    summary: 'SMS 인증번호 전송',
    description: '6자리 숫자 인증번호 전송',
  })
  @ApiBody({
    schema: {
      properties: {
        phoneNumber: { type: 'string', example: '01055039184' },
      },
    },
  })
  @Post('SMS')
  async sendSMS(@Body() body: Record<string, string>) {
    return this.authService.sendSMS(body.phoneNumber);
  }
}
