import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post('/signup')
  async signup(@Body() body: any) {
    // dto 작성 예정
    return this.usersService.signup(body);
  }
}
