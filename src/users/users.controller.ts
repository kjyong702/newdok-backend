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
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';

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

  @ApiOperation({ summary: '로그인' })
  @ApiBody({
    schema: {
      properties: {
        loginId: { type: 'string', example: 'newdok' },
        password: { type: 'string', example: '!abc1234' },
      },
    },
  })
  @Post('/login')
  async login(@Body() loginDto: Record<string, string>) {
    return this.usersService.login(loginDto.loginId, loginDto.password);
  }

  @ApiOperation({
    summary: '사전조사',
    description: '유저가 선택한 종사 산업과 관심사를 바탕으로 뉴스레터 추천',
  })
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
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Get('/preInvestigate')
  async preInvestigate(
    @Query('industry') industryId: string,
    @Query('interest') interestIds: string[],
    @Req() req: any,
  ) {
    return this.usersService.preInvestigate(
      industryId,
      interestIds,
      req.user.id,
    );
  }

  @ApiOperation({
    summary: '아이디 중복 검사',
    description: '해당 아이디로 가입된 계정 존재 여부 검사',
  })
  @ApiQuery({
    name: 'loginId',
    description: '사용자 아이디',
    example: 'newdok',
  })
  @Get('/check/loginId')
  async getUserByLoginId(@Query('loginId') loginId: string) {
    return this.usersService.getUserByLoginId(loginId);
  }

  @ApiOperation({
    summary: '전화 번호 중복 검사',
    description: '해당 번호로 가입된 계정 리스트 반환',
  })
  @ApiQuery({
    name: 'phoneNumber',
    description: '휴대폰 번호',
    example: '01055039184',
  })
  @Get('/check/phoneNumber')
  async getUsersByPhoneNumber(@Query('phoneNumber') phoneNumber: string) {
    return this.usersService.getUsersByPhoneNumber(phoneNumber);
  }

  @ApiOperation({ summary: '구독 닉네임 변경' })
  @ApiBody({
    schema: {
      properties: {
        nickname: { type: 'string', example: '뉴독' },
      },
    },
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Patch('mypage/nickname')
  async changeNickname(@Body('nickname') nickname: string, @Req() req: any) {
    return this.usersService.changeNickname(nickname, req.user.id);
  }

  @ApiOperation({ summary: '종사 산업 변경' })
  @ApiBody({
    schema: {
      properties: {
        industryId: { type: 'number', example: 1 },
      },
    },
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Patch('mypage/industry')
  async changeIndustry(
    @Body('industryId') industryId: number,
    @Req() req: any,
  ) {
    return this.usersService.changeIndustry(industryId, req.user.id);
  }

  @ApiOperation({ summary: '관심사 변경' })
  @ApiBody({
    schema: {
      properties: {
        interestIds: {
          type: 'number[]',
          example: [1, 2],
          description: '선택 관심사가 1개여도 배열로 요청',
        },
      },
    },
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Patch('mypage/interest')
  async changeInterest(
    @Body('interestIds') interestIds: number[],
    @Req() req: any,
  ) {
    return this.usersService.changeInterest(interestIds, req.user.id);
  }

  @ApiOperation({ summary: '휴대폰 번호 변경' })
  @ApiBody({
    schema: {
      properties: {
        phoneNumber: { type: 'string', example: '01055039184' },
      },
    },
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Patch('mypage/phoneNumber')
  async changePhoneNumber(
    @Body('phoneNumber') phoneNumber: string,
    @Req() req: any,
  ) {
    return this.usersService.changePhoneNumber(phoneNumber, req.user.id);
  }

  @ApiOperation({ summary: '비밀번호 재설정' })
  @ApiBody({
    schema: {
      properties: {
        loginId: { type: 'string', example: 'newdok' },
        prevPassword: { type: 'string', example: 'assdfsd1@s2' },
        password: { type: 'string', example: '@def5678' },
      },
    },
  })
  @Patch('mypage/password')
  async resetPassword(
    @Body('loginId') loginId: string,
    @Body('prevPassword') prevPassword: string,
    @Body('password') password: string,
  ) {
    return this.usersService.resetPassword(loginId, prevPassword, password);
  }
}
