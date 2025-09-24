import { Injectable, BadRequestException } from '@nestjs/common';
import { NewslettersService } from '../newsletters/newsletters.service';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from './dtos/create-user.dto';
import * as bcrypt from 'bcrypt';

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

    const userList = await this.prisma.user.findMany();

    const emailIndex = parseInt(userList[userList.length - 1].emailIndex) + 1;
    const subscribeEmail = `newdok${emailIndex}@newdok.store`;
    const subscribePassword = `!Kknewdok${emailIndex}`;
    const hashedLoginPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        loginId,
        password: hashedLoginPassword,
        phoneNumber,
        subscribeEmail,
        subscribePassword,
        nickname,
        birthYear,
        gender,
        emailIndex: `${emailIndex}`,
      },
      include: {
        interests: true,
      },
    });
    const accessToken = await this.jwtService.signAsync({ id: user.id });

    return {
      user: {
        id: user.id,
        loginId: user.loginId,
        phoneNumber: user.phoneNumber,
        nickname: user.nickname,
        birthYear: user.birthYear,
        gender: user.gender,
        createdAt: user.createdAt,
      },
      accessToken,
    };
  }

  async login(loginId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        loginId,
        deletedAt: null, // 탈퇴되지 않은 유저만
      },
      include: {
        interests: true,
      },
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
    return {
      user: {
        id: user.id,
        loginId: user.loginId,
        phoneNumber: user.phoneNumber,
        subscribeEmail: user.subscribeEmail,
        nickname: user.nickname,
        birthYear: user.birthYear,
        gender: user.gender,
        createdAt: user.createdAt,
        industryId: user.industryId,
        interests: user.interests,
      },
      accessToken,
    };
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
    const updatedUser = await this.prisma.user.update({
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
      include: {
        interests: true,
      },
    });

    const { intersection, union } =
      await this.newslettersService.getRecommendedNewsletters(userId);

    const accessToken = await this.jwtService.signAsync({ id: userId });

    if (intersection.length >= 6) {
      return { user: updatedUser, data: intersection.slice(0, 6), accessToken };
    } else {
      return {
        user: updatedUser,
        data: intersection.concat(union).slice(0, 6),
        accessToken,
      };
    }
  }

  async getUserByLoginId(loginId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        loginId,
        deletedAt: null, // 탈퇴되지 않은 유저만
      },
      select: {
        id: true,
        loginId: true,
        phoneNumber: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new BadRequestException('가입되지 않은 아이디입니다');
    }

    return user;
  }

  async getUsersByPhoneNumber(phoneNumber: string) {
    const users = await this.prisma.user.findMany({
      where: {
        phoneNumber,
        deletedAt: null, // 탈퇴되지 않은 유저만
      },
      select: {
        id: true,
        loginId: true,
        phoneNumber: true,
        createdAt: true,
      },
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
      select: {
        id: true,
        loginId: true,
        nickname: true,
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
      select: {
        id: true,
        loginId: true,
        industryId: true,
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
      select: {
        id: true,
        loginId: true,
        interests: true,
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
      select: {
        id: true,
        loginId: true,
        phoneNumber: true,
      },
    });

    return updatedUser;
  }

  async resetPassword(
    loginId: string,
    prevPassword: string,
    newPassword: string,
  ) {
    // 기존 비밀번호가 있으면 마이페이지-비밀번호 변경으로 처리
    if (prevPassword) {
      const user = await this.prisma.user.findUnique({
        where: {
          loginId,
          deletedAt: null, // 탈퇴되지 않은 유저만
        },
      });
      if (!user) {
        throw new BadRequestException('가입되지 않은 아이디입니다');
      }
      const isValid = await bcrypt.compare(prevPassword, user.password);
      if (!isValid) {
        throw new BadRequestException('현재 비밀번호가 일치하지 않습니다');
      }
    }
    const newHashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedUser = await this.prisma.user.update({
      where: {
        loginId,
        deletedAt: null, // 탈퇴되지 않은 유저만
      },
      data: {
        password: newHashedPassword,
      },
      select: {
        id: true,
        loginId: true,
      },
    });

    return updatedUser;
  }

  async getMyInfo(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
        deletedAt: null, // 탈퇴되지 않은 유저만
      },
      include: {
        interests: true,
      },
    });
    if (!user) {
      throw new BadRequestException('존재하지 않는 유저입니다');
    }
    return user;
  }

  async withdrawUser(userId: number) {
    // 이미 탈퇴한 유저인지 확인
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new BadRequestException('존재하지 않는 유저입니다');
    }

    if (user.deletedAt) {
      throw new BadRequestException('이미 탈퇴한 유저입니다');
    }

    // Soft Delete: deletedAt 필드에 현재 시간 설정
    const deletedAt = new Date();
    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        deletedAt,
      },
    });

    return {
      message: '회원 탈퇴가 완료되었습니다.',
      deletedAt,
    };
  }
}
