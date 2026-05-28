import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class KakaoAuthDto {
  @ApiProperty({
    example: 'authorization-code-from-kakao',
    description: '카카오 로그인 후 전달받은 authorization code',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    example: 'newdok://oauth/kakao',
    description: '카카오 디벨로퍼스에 등록된 redirect URI',
  })
  @IsString()
  @IsNotEmpty()
  redirectUri: string;
}
