import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NewslettersService } from '../newsletters/newsletters.service';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from './dtos/create-user.dto';
import { AuthAccount, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  hasUniqueTarget,
  isPrismaKnownRequestError,
} from '../common/utils/prisma-error.util';
import { MAILBOX_POOL_STATUS } from './constants/mailbox-pool-status';
import { AppleAuthService } from '../auth/apple-auth.service';
import { KakaoAuthService } from '../auth/kakao-auth.service';
import { AUTH_PROVIDER } from '../auth/constants/auth-provider';

class RetryableMailboxAllocationError extends Error {
  constructor() {
    super('MAILBOX_ALLOCATION_RETRY');
  }
}

@Injectable()
export class UsersService {
  private readonly SIGNUP_CREATE_RETRY_LIMIT = 3;
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private newslettersService: NewslettersService,
    private prisma: PrismaService,
    private jwtService: JwtService,
    private appleAuthService: AppleAuthService,
    private kakaoAuthService: KakaoAuthService,
  ) {}

  async signup(createUserDto: CreateUserDto) {
    const { loginId, password, phoneNumber, nickname, birthYear, gender } =
      createUserDto;
    const existingUser = await this.prisma.user.findUnique({
      where: {
        loginId,
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      throw new BadRequestException('이미 사용 중인 아이디입니다.');
    }

    const hashedLoginPassword = await bcrypt.hash(password, 10);
    let user: Awaited<ReturnType<typeof this.prisma.user.create>> | null = null;

    for (
      let attempt = 0;
      attempt < this.SIGNUP_CREATE_RETRY_LIMIT && !user;
      attempt++
    ) {
      try {
        user = await this.prisma.$transaction(
          async (tx) => {
            const mailbox = await tx.mailboxPool.findFirst({
              where: {
                status: MAILBOX_POOL_STATUS.AVAILABLE,
              },
              orderBy: {
                id: 'asc',
              },
            });

            if (!mailbox) {
              throw new ServiceUnavailableException(
                '사용 가능한 구독 이메일이 없습니다. 관리자에게 문의해주세요.',
              );
            }

            const reservedMailbox = await tx.mailboxPool.updateMany({
              where: {
                id: mailbox.id,
                status: MAILBOX_POOL_STATUS.AVAILABLE,
              },
              data: {
                status: MAILBOX_POOL_STATUS.ASSIGNED,
                assignedAt: new Date(),
              },
            });

            if (reservedMailbox.count === 0) {
              throw new RetryableMailboxAllocationError();
            }

            return tx.user.create({
              data: {
                loginId,
                password: hashedLoginPassword,
                phoneNumber,
                subscribeEmail: mailbox.email,
                subscribePassword: mailbox.password,
                nickname,
                birthYear,
                gender,
                emailIndex: this.extractEmailIndex(mailbox.email),
                mailboxPool: {
                  connect: {
                    id: mailbox.id,
                  },
                },
              },
              include: {
                interests: true,
              },
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error) {
        if (error instanceof RetryableMailboxAllocationError) {
          continue;
        }

        if (!isPrismaKnownRequestError(error) || error.code !== 'P2002') {
          throw error;
        }

        if (hasUniqueTarget(error, 'loginid')) {
          throw new BadRequestException('이미 사용 중인 아이디입니다.');
        }

        if (hasUniqueTarget(error, 'subscribeemail', 'mailboxpoolid')) {
          continue;
        }

        throw new ConflictException('중복된 회원 정보가 존재합니다.');
      }
    }

    if (!user) {
      throw new ServiceUnavailableException(
        '회원가입용 구독 계정 생성이 지연되고 있습니다. 다시 시도해주세요.',
      );
    }

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

  private extractEmailIndex(email: string) {
    const match = email.match(/^newdok(\d+)@/i);

    if (!match) {
      throw new ConflictException(
        '구독 이메일 계정 정보가 올바르지 않습니다. 관리자에게 문의해주세요.',
      );
    }

    return match[1];
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
    if (!user.password) {
      throw new BadRequestException(
        '비밀번호 로그인 계정이 아닙니다. 소셜 로그인을 이용해주세요.',
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
    // 1. 기존 관심사 관계 삭제 (중복 방지)
    await this.prisma.interestsOnUsers.deleteMany({
      where: {
        userId,
      },
    });

    // 2. User - Interest 관계: InterestOnUsers 테이블 데이터 생성
    if (interestIds.length > 0) {
      await this.prisma.interestsOnUsers.createMany({
        data: interestIds.map((id) => ({
          userId,
          interestId: parseInt(id),
        })),
        skipDuplicates: true, // 중복 방지 (안전장치)
      });
    }

    // 3. User - Industry 관계 업데이트
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
    // 1. 중복 제거
    const uniqueInterestIds = [...new Set(newInterestIds)];

    // 2. 유저 관심사 일괄 삭제
    await this.prisma.interestsOnUsers.deleteMany({
      where: {
        userId,
      },
    });

    // 3. 유저 관심사 일괄 재생성
    if (uniqueInterestIds.length > 0) {
      await this.prisma.interestsOnUsers.createMany({
        data: uniqueInterestIds.map((interestId) => ({
          userId,
          interestId,
        })),
        skipDuplicates: true, // 중복 방지 (안전장치)
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
      if (!user.password) {
        throw new BadRequestException(
          '비밀번호 로그인 계정이 아닙니다. 소셜 로그인을 이용해주세요.',
        );
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
      include: {
        authAccounts: true,
      },
    });

    if (!user) {
      throw new BadRequestException('존재하지 않는 유저입니다');
    }

    if (user.deletedAt) {
      throw new BadRequestException('이미 탈퇴한 유저입니다');
    }

    const providerUnlinks = await this.unlinkAuthAccounts(user.authAccounts);

    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.bookmark.deleteMany({
        where: {
          userId,
        },
      });

      await tx.newslettersOnUsers.deleteMany({
        where: {
          userId,
        },
      });

      await tx.interestsOnUsers.deleteMany({
        where: {
          userId,
        },
      });

      await tx.article.deleteMany({
        where: {
          userId,
        },
      });

      await tx.authAccount.deleteMany({
        where: {
          userId,
        },
      });

      await tx.userConsent.deleteMany({
        where: {
          userId,
        },
      });

      if (user.mailboxPoolId) {
        await tx.mailboxPool.update({
          where: {
            id: user.mailboxPoolId,
          },
          data: {
            status: MAILBOX_POOL_STATUS.RETIRED,
          },
        });
      }

      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          deletedAt,
        },
      });
    });

    return {
      message: '회원 탈퇴가 완료되었습니다.',
      deletedAt,
      providerUnlinks,
    };
  }

  // 탈퇴는 provider 연결 해제 실패로 막지 않는다. 실패는 응답의 unlinked=false와 서버 로그로 확인한다.
  private async unlinkAuthAccounts(authAccounts: AuthAccount[]) {
    const results: Array<{
      provider: string;
      unlinked: boolean;
      reason?: string;
    }> = [];

    for (const authAccount of authAccounts) {
      results.push(await this.unlinkAuthAccount(authAccount));
    }

    return results;
  }

  private async unlinkAuthAccount(authAccount: AuthAccount) {
    try {
      if (authAccount.provider === AUTH_PROVIDER.KAKAO) {
        await this.kakaoAuthService.unlinkUser(authAccount.providerUserId);

        return { provider: authAccount.provider, unlinked: true };
      }

      if (authAccount.provider === AUTH_PROVIDER.APPLE) {
        if (
          !authAccount.providerRefreshTokenEncrypted ||
          !authAccount.providerClientId
        ) {
          return {
            provider: authAccount.provider,
            unlinked: false,
            reason:
              '저장된 Apple refresh token이 없습니다. 새 앱 버전으로 로그인(authorizationCode 전달) 후 다시 탈퇴하면 연결 해제됩니다.',
          };
        }

        await this.appleAuthService.revokeRefreshToken(
          authAccount.providerRefreshTokenEncrypted,
          authAccount.providerClientId,
        );

        return { provider: authAccount.provider, unlinked: true };
      }

      return {
        provider: authAccount.provider,
        unlinked: false,
        reason: '연결 해제를 지원하지 않는 provider입니다.',
      };
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : '알 수 없는 오류입니다.';

      this.logger.warn(
        `${authAccount.provider} 연결 해제 실패 (userId=${authAccount.userId}): ${reason}`,
      );

      return { provider: authAccount.provider, unlinked: false, reason };
    }
  }
}
