import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: '로그인 아이디',
    example: 'newdok',
  })
  @IsString()
  loginId: string;

  @ApiProperty({
    description: '비밀번호',
    example: '!abc1234',
  })
  @IsString()
  password: string;

  @ApiProperty({
    description: '전화번호',
    example: '01012345678',
  })
  @IsString()
  phoneNumber: string;

  @ApiProperty({
    description: '구독 닉네임',
    example: '뉴독',
  })
  @IsString()
  nickname: string;

  @ApiProperty({
    description: '태어난 연도',
    example: '1997',
  })
  @IsString()
  birthYear: string;

  @ApiProperty({
    description: '성별',
    example: '남자',
  })
  @IsString()
  gender: string;
}
