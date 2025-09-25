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
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';

@ApiTags('User')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @ApiOperation({
    summary: '전화 번호로 계정 조회',
    description: '해당 번호로 가입된 계정 리스트 반환',
  })
  @ApiQuery({
    name: 'phoneNumber',
    description: '휴대폰 번호',
    example: '01055039184',
    required: true,
  })
  @ApiOkResponse({
    description: '가입된 계정이 있는 경우, 계정 정보 리스트 반환',
    schema: {
      example: [
        {
          id: 27,
          loginId: 'database',
          phoneNumber: '01012345678',
          createdAt: '2023-08-20T07:39:43.674Z',
        },
        {
          id: 91,
          loginId: 'kjyong702',
          phoneNumber: '01011112222',
          createdAt: '2023-09-27T11:51:12.876Z',
        },
      ],
    },
  })
  @ApiBadRequestResponse({
    description: '가입된 계정이 없는 경우, 에러 메시지 반환',
    schema: {
      example: {
        statusCode: 400,
        message: '가입되지 않은 휴대폰 번호입니다',
        error: 'Bad Request',
      },
    },
  })
  @Get('/check/phoneNumber')
  async getUsersByPhoneNumber(@Query('phoneNumber') phoneNumber: string) {
    return this.usersService.getUsersByPhoneNumber(phoneNumber);
  }

  @ApiOperation({
    summary: '아이디 중복 검사',
    description: '해당 아이디로 가입된 계정 존재 여부 검사',
  })
  @ApiQuery({
    name: 'loginId',
    description: '사용자 아이디',
    example: 'newdok',
    required: true,
  })
  @ApiOkResponse({
    description: '가입된 계정이 있는 경우, 해당 계정 정보 반환',
    schema: {
      example: {
        id: 29,
        loginId: 'testacc1',
        phoneNumber: '01012345678',
        createdAt: '2023-08-20T07:41:51.553Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: '가입된 계정이 없는 경우, 에러 메시지 반환',
    schema: {
      example: {
        statusCode: 400,
        message: '가입되지 않은 아이디입니다',
        error: 'Bad Request',
      },
    },
  })
  @Get('/check/loginId')
  async getUserByLoginId(@Query('loginId') loginId: string) {
    return this.usersService.getUserByLoginId(loginId);
  }

  @ApiOperation({
    summary: '회원가입',
  })
  @ApiBody({
    type: CreateUserDto,
  })
  @ApiCreatedResponse({
    description: '회원가입 성공',
    schema: {
      example: {
        user: {
          id: 1,
          loginId: 'newdok',
          phoneNumber: '01012345678',
          nickname: '뉴독',
          birthYear: '1997',
          gender: '남자',
          createdAt: '2024-09-09T07:25:37.282Z',
        },
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI',
      },
    },
  })
  @ApiBadRequestResponse({
    description: '회원가입 실패',
    schema: {
      example: {
        statusCode: 400,
        message: '유효하지 않은 입력 데이터입니다',
        error: 'Bad Request',
      },
    },
  })
  @Post('/signup')
  async signup(@Body() createUserDto: CreateUserDto) {
    return this.usersService.signup(createUserDto);
  }

  @ApiOperation({ summary: '로그인' })
  @ApiBody({
    schema: {
      properties: {
        loginId: { type: 'string', example: 'kjyong702' },
        password: { type: 'string', example: 'k1203702' },
      },
    },
  })
  @ApiOkResponse({
    description: '로그인 성공',
    schema: {
      example: {
        user: {
          id: 1,
          loginId: 'newdok',
          phoneNumber: '01012345678',
          subscribeEmail: 'newdok@newdok.store',
          nickname: '뉴독',
          birthYear: '1997',
          gender: '남자',
          createdAt: '2024-09-09T07:25:37.282Z',
          industryId: 4,
          interests: [
            {
              userId: 91,
              interestId: 1,
              createdAt: '2024-07-04T07:25:36.701Z',
            },
            {
              userId: 91,
              interestId: 3,
              createdAt: '2023-09-27T11:51:39.629Z',
            },
          ],
        },
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
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
    example: '1',
    required: true,
  })
  @ApiQuery({
    name: 'interest',
    description: '관심사 id 배열',
    example: ['1', '2', '3'],
    required: true,
    isArray: true,
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '뉴스레터 추천 리스트 반환',
    schema: {
      example: {
        data: [
          {
            brandId: 12,
            brandName: 'NEWNEEK',
            briefDescription: '세상 돌아가는 소식, 뉴닉으로!',
            publicationCycle: '매주 평일 아침',
            subscribeUrl: 'https://newneek.co/',
            imageUrl: '',
            interests: [
              { id: 1, name: '경제・시사・상식' },
              { id: 2, name: '비즈니스' },
              { id: 4, name: '트렌드' },
            ],
          },
          {
            brandId: 23,
            brandName: 'NAME1',
            briefDescription: '...',
            publicationCycle: '...',
            subscribeUrl: '...',
            imageUrl: '...',
            interests: [
              { id: 3, name: '건강' },
              { id: 5, name: '기술' },
            ],
          },
        ],
      },
    },
  })
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
  @ApiOkResponse({
    description: '종사 산업이 성공적으로 변경되었습니다.',
    schema: {
      example: {
        id: 29,
        loginId: 'testacc1',
        industryId: 4,
      },
    },
  })
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
  @ApiOkResponse({
    description: '관심사가 성공적으로 변경되었습니다.',
    schema: {
      example: {
        id: 29,
        loginId: 'testacc1',
        interests: [
          {
            userId: 29,
            interestId: 4,
            createdAt: '2023-11-20T09:46:09.986Z',
          },
          {
            userId: 29,
            interestId: 9,
            createdAt: '2023-11-20T09:46:10.225Z',
          },
        ],
      },
    },
  })
  @Patch('mypage/interest')
  async changeInterest(
    @Body('interestIds') interestIds: number[],
    @Req() req: any,
  ) {
    return this.usersService.changeInterest(interestIds, req.user.id);
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
  @ApiOkResponse({
    description: '비밀번호가 성공적으로 변경되었습니다.',
    schema: {
      example: {
        id: 29,
        loginId: 'testacc1',
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
  @ApiOkResponse({
    description: '구독 닉네임이 성공적으로 변경되었습니다.',
    schema: {
      example: {
        id: 29,
        loginId: 'testacc1',
        nickname: true,
      },
    },
  })
  @Patch('mypage/nickname')
  async changeNickname(@Body('nickname') nickname: string, @Req() req: any) {
    return this.usersService.changeNickname(nickname, req.user.id);
  }

  @ApiOperation({ summary: '전화 번호 변경' })
  @ApiBody({
    schema: {
      properties: {
        phoneNumber: { type: 'string', example: '01055039184' },
      },
    },
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '전화 번호가 성공적으로 변경되었습니다.',
    schema: {
      example: {
        id: 29,
        loginId: 'testacc1',
        phoneNumber: true,
      },
    },
  })
  @Patch('mypage/phoneNumber')
  async changePhoneNumber(
    @Body('phoneNumber') phoneNumber: string,
    @Req() req: any,
  ) {
    return this.usersService.changePhoneNumber(phoneNumber, req.user.id);
  }

  @Get('my')
  @ApiOperation({ summary: '내 정보 조회' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async getMyInfo(@Req() req: any) {
    return this.usersService.getMyInfo(req.user.id);
  }

  @ApiOperation({
    summary: '회원 탈퇴',
    description: '사용자 계정을 탈퇴 처리합니다. (Soft Delete)',
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '회원 탈퇴가 성공적으로 처리되었습니다.',
    schema: {
      example: {
        message: '회원 탈퇴가 완료되었습니다.',
        deletedAt: '2024-12-19T10:30:00.000Z',
      },
    },
  })
  @Patch('/withdraw')
  async withdrawUser(@Req() req: any) {
    return this.usersService.withdrawUser(req.user.id);
  }
}
