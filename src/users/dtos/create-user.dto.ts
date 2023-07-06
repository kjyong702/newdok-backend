import { IsString } from 'class-validator';

export class CreateUserDto {
  @IsString()
  loginId: string;

  @IsString()
  password: string;

  @IsString()
  phoneNumber: string;

  @IsString()
  nickname: string;

  @IsString()
  birthYear: string;

  @IsString()
  gender: string;
}
