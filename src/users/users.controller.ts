import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dtos/create-user.dto';
import { AuthGuard } from '../guards/auth.guard';
import { ApiTags, ApiOperation, ApiBody, ApiQuery } from '@nestjs/swagger';

@ApiTags('User')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @ApiOperation({ summary: '회원가입' })
  @ApiBody({
    type: CreateUserDto,
  })
  @Post('/signup')
  async signup(@Body() createUserDto: CreateUserDto) {
    return this.usersService.signup(createUserDto);
  }

  @ApiBody({
    schema: {
      properties: {
        loginId: { type: 'string', example: 'newdok' },
        password: { type: 'string', example: '!abc1234' },
      },
    },
  })
  @ApiOperation({ summary: '로그인' })
  @Post('/login')
  async login(@Body() loginDto: Record<string, string>) {
    return this.usersService.login(loginDto.loginId, loginDto.password);
  }

  @ApiQuery({
    name: 'loginId',
    description: '사용자 아이디',
    example: 'newdok',
  })
  @ApiOperation({
    summary: '아이디 중복 검사',
    description: '해당 아이디로 가입된 계정 리스트 반환',
  })
  @Get('/check/loginId')
  async getUserByLoginId(@Query('loginId') loginId: string) {
    return this.usersService.getUserByLoginId(loginId);
  }

  @ApiQuery({
    name: 'phoneNumber',
    description: '사용자 전화번호',
    example: '01055039184',
  })
  @ApiOperation({
    summary: '전화 번호 중복 검사',
    description: '해당 번호로 가입된 계정 리스트 반환',
  })
  @Get('/check/phoneNumber')
  async getUsersByPhoneNumber(@Query('phoneNumber') phoneNumber: string) {
    return this.usersService.getUsersByPhoneNumber(phoneNumber);
  }

  @ApiBody({
    schema: {
      properties: {
        phoneNumber: { type: 'string', example: '01055039184' },
      },
    },
  })
  @ApiOperation({
    summary: 'SMS 인증번호 전송',
    description: '6자리 숫자 인증번호 전송',
  })
  @Post('/auth/SMS')
  async sendSMS(@Body() body: Record<string, string>) {
    return this.usersService.sendSMS(body.phoneNumber);
  }

  @ApiBody({
    schema: {
      properties: {
        loginId: { type: 'string', example: 'kjyong702' },
        newPassword: { type: 'string', example: '@def5678' },
      },
    },
  })
  @ApiOperation({ summary: '비밀번호 초기화' })
  @Patch('reset/password')
  async resetPassword(@Body() body: Record<string, string>) {
    return this.usersService.resetPassword(body.loginId, body.newPassword);
  }

  @ApiQuery({
    name: 'industry',
    description: '종사 산업 id',
    example: 1,
  })
  @ApiQuery({
    name: 'interest',
    description: '관심사 id',
    example: 1,
  })
  @ApiOperation({
    summary: '사전조사',
    description: '유저가 선택한 종사 산업과 관심사를 바탕으로 뉴스레터 추천',
  })
  @Get('/preInvestigate')
  @UseGuards(AuthGuard)
  async preInvestigate(@Query() query: any, @Req() req: any) {
    return this.usersService.preInvestigate(
      req.user.id,
      query.industry,
      query.interest,
    );
  }
}
