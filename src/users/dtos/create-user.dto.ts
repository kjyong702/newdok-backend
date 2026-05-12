import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: '로그인 아이디',
    example: 'newdok',
  })
  @IsNotEmpty()
  @IsString()
  loginId: string;

  @ApiProperty({
    description: '비밀번호',
    example: '!abc1234',
  })
  @IsNotEmpty()
  @IsString()
  password: string;

  @ApiProperty({
    description: '전화번호',
    example: '01012345678',
  })
  @IsNotEmpty()
  @IsString()
  phoneNumber: string;

  @ApiProperty({
    description: '구독 닉네임',
    example: '뉴독',
  })
  @IsNotEmpty()
  @IsString()
  nickname: string;

  @ApiProperty({
    description: '태어난 연도',
    example: '1997',
  })
  @IsNotEmpty()
  @IsString()
  birthYear: string;

  @ApiProperty({
    description: '성별',
    example: '남자',
  })
  @IsNotEmpty()
  @IsString()
  gender: string;
}
