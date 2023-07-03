import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async signup(signupData: any) {
    const { loginId, password, phoneNumber } = signupData;

    console.log(loginId);
  }
}
