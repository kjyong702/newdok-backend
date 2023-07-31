import { Injectable, BadRequestException } from '@nestjs/common';
import { NewslettersService } from '../newsletters/newsletters.service';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from './dtos/create-user.dto';
import * as bcrypt from 'bcrypt';
const CryptoJS = require('crypto-js');

@Injectable()
export class UsersService {
  constructor(
    private newslettersService: NewslettersService,
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async signup(createUserDto: CreateUserDto) {
    const { loginId, password, phoneNumber, nickname, birthYear, gender } =
      createUserDto;
    const subscribeEmail = 'test@newdok.site'; // 추후 이메일 자동부여 기능 구현
    const subscribedPassword = '!Kktest';

    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedSubscribedPassword = await bcrypt.hash(subscribedPassword, 10);

    const user = await this.prisma.user.create({
      data: {
        loginId,
        password: hashedPassword,
        phoneNumber,
        subscribeEmail,
        subscribePassword: hashedSubscribedPassword,
        nickname,
        birthYear,
        gender,
      },
    });
    const accessToken = await this.jwtService.signAsync({ id: user.id });

    return { user, accessToken };
  }

  async login(loginId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { loginId },
    });
    if (!user) {
      throw new BadRequestException(
        '등록되지 않은 계정이거나, 아이디를 다시 확인해주세요',
      );
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      throw new BadRequestException('비밀번호가 일치하지 않습니다');
    }

    const accessToken = await this.jwtService.signAsync({ id: user.id });

    return { user, accessToken };
  }

  async preInvestigate(
    industryId: string,
    interestIds: string[],
    userId: number,
  ) {
    // 1. User - Interest 관계: InterestOnUsers 테이블 데이터 생성
    for (const id of interestIds) {
      await this.prisma.interestsOnUsers.createMany({
        data: [
          {
            userId,
            interestId: parseInt(id),
          },
        ],
      });
    }
    // 2. User - Industry 관계
    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        industry: {
          connect: {
            id: parseInt(industryId),
          },
        },
      },
    });

    const { intersection, union } =
      await this.newslettersService.getRecommendedNewsletters(userId);

    if (intersection.length >= 6) {
      return intersection.slice(0, 6);
    } else {
      return intersection.concat(union).slice(0, 6);
    }
  }

  async sendSMS(phoneNumber: string) {
    const SERVICE_ID = process.env.NCP_SERVICE_ID || '';
    const ACCESS_KEY = process.env.NCP_ACCESS_KEY || '';
    const SECRET_KEY = process.env.NCP_SECRET_KEY || '';
    const FROM_NUMBER = process.env.NCP_FROM_NUMBER || '';

    const getSignature = (
      serviceId: string,
      accessKey: string,
      secretKey: string,
      timestamp: string,
    ) => {
      const space = ' ';
      const newLine = '\n';
      const method = 'POST';
      const url = `/sms/v2/services/${serviceId}/messages`;

      const hmac = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA256, secretKey);

      hmac.update(method);
      hmac.update(space);
      hmac.update(url);
      hmac.update(newLine);
      hmac.update(timestamp);
      hmac.update(newLine);
      hmac.update(accessKey);

      const hash = hmac.finalize();

      return hash.toString(CryptoJS.enc.Base64);
    };

    const timestamp = Date.now().toString();
    const signature = getSignature(
      SERVICE_ID,
      ACCESS_KEY,
      SECRET_KEY,
      timestamp,
    );

    const url = `https://sens.apigw.ntruss.com/sms/v2/services/${SERVICE_ID}/messages`;
    const verifyCode = Math.floor(Math.random() * (999999 - 100000)) + 100000;

    const body = JSON.stringify({
      type: 'SMS',
      contentType: 'COMM',
      countryCode: '82',
      from: FROM_NUMBER,
      content: `인증번호 [${verifyCode}]를 입력해주세요.`,
      messages: [
        {
          to: phoneNumber,
        },
      ],
    });
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ncp-iam-access-key': ACCESS_KEY,
        'x-ncp-apigw-timestamp': timestamp,
        'x-ncp-apigw-signature-v2': signature,
      },
      body,
    });

    const result = await response.json();
    if (result.statusCode === '202') {
      return {
        code: verifyCode,
      };
    } else {
      console.log(result);
      throw new Error('SMS 요청 실패');
    }
  }

  async getUserByLoginId(loginId: string) {
    const user = await this.prisma.user.findUnique({
      where: { loginId },
    });
    if (!user) {
      throw new BadRequestException('가입되지 않은 아이디입니다');
    } else {
      throw new BadRequestException('이미 사용중인 아이디입니다');
    }
  }

  async getUsersByPhoneNumber(phoneNumber: string) {
    const users = await this.prisma.user.findMany({
      where: { phoneNumber },
    });
    if (users.length === 0) {
      throw new BadRequestException('가입되지 않은 휴대폰 번호입니다');
    }
    return users;
  }

  async changeNickname(newNickname: string, userId: number) {
    const updatedUser = await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        nickname: newNickname,
      },
    });

    return updatedUser;
  }

  async changeIndustry(newIndustryId: number, userId: number) {
    const updatedUser = await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        industry: {
          connect: {
            id: newIndustryId,
          },
        },
      },
    });

    return updatedUser;
  }

  async changeInterest(newInterestIds: number[], userId: number) {
    // 1. 유저 관심사 일괄 삭제
    await this.prisma.interestsOnUsers.deleteMany({
      where: {
        userId,
      },
    });
    // 2. 유저 관심사 각각 재생성
    for (const newInterestId of newInterestIds) {
      await this.prisma.interestsOnUsers.create({
        data: {
          userId,
          interestId: newInterestId,
        },
      });
    }
    const updatedUser = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    return updatedUser;
  }

  async changePhoneNumber(newPhoneNumber: string, userId: number) {
    const updatedUser = await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        phoneNumber: newPhoneNumber,
      },
    });

    return updatedUser;
  }

  async resetPassword(newPassword: string, userId: number) {
    const newHashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedUser = await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        password: newHashedPassword,
      },
    });

    return updatedUser;
  }
}
