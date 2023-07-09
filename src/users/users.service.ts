import { Injectable, BadRequestException } from '@nestjs/common';
import { NewslettersService } from '../newsletters/newsletters.service';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from './dtos/create-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private newslettersService: NewslettersService,
  ) {}

  async signup(createUserDto: CreateUserDto) {
    const { loginId, password, phoneNumber, nickname, birthYear, gender } =
      createUserDto;
    const subscribeEmail = 'test@newdok.site'; // 추후 이메일 자동부여 기능 구현
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        loginId,
        password: hashedPassword,
        phoneNumber,
        subscribeEmail,
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

  async resetPassword(loginId: string, newPassword: string) {
    const newHashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedUser = await this.prisma.user.update({
      where: { loginId },
      data: {
        password: newHashedPassword,
      },
    });

    return updatedUser;
  }

  // 뉴스레터 리스트 반환 시, 유저의 구독 여부를 함께 보낸다
  // 1. User의 industry와 interests 부분이 null이므로 이를 연결시켜야한다.
  // 2. industry 경우 존재하는 Industry 데이터와 connect 작업
  // 3. interest의 경우 Interest 데이터가 아니라 InterestsOnUsers 데이터와 연결되어야 하므로 이는 존재하지 않는 데이터를 create 먼저 해야한다(이게 중요)
  async preInvestigate(
    userId: number,
    industryId: string,
    interestIds: string[],
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
      await this.newslettersService.getRecommendedNewsletters(
        industryId,
        interestIds,
      );

    if (intersection.length >= 6) {
      return intersection.slice(0, 6);
    } else {
      return intersection.concat(union).slice(0, 6);
    }
  }
}
