import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dtos/create-user.dto';
import { AuthGuard } from '../guards/auth.guard';
import { User } from '@prisma/client';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post('/signup')
  async signup(@Body() createUserDto: CreateUserDto) {
    return this.usersService.signup(createUserDto);
  }

  @Post('/login')
  async login(@Body() loginDto: Record<string, string>) {
    return this.usersService.login(loginDto.loginId, loginDto.password);
  }

  @Get('/check/loginId')
  async getUserByLoginId(@Query('loginId') loginId: string) {
    return this.usersService.getUserByLoginId(loginId);
  }

  @Get('/check/phoneNumber')
  async getUsersByPhoneNumber(@Query('phoneNumber') phoneNumber: string) {
    return this.usersService.getUsersByPhoneNumber(phoneNumber);
  }

  @Patch('reset/password')
  async resetPassword(@Body() body: Record<string, string>) {
    return this.usersService.resetPassword(body.loginId, body.newPassword);
  }

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
