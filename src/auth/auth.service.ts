import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { MAILBOX_POOL_STATUS } from '../users/constants/mailbox-pool-status';
import { AUTH_PROVIDER } from './constants/auth-provider';
import { USER_CONSENT_POLICY } from './constants/user-consent-policy';
import { AppleAuthService } from './apple-auth.service';
import { SocialSignupDto } from './dtos/social-signup.dto';
import { SocialAuthDto } from './dtos/social-auth.dto';
import { AUTH_PLATFORM } from './constants/auth-platform';

type KakaoTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
};

type KakaoUserProfile = {
  providerUserId: string;
  email: string | null;
  nickname: string | null;
};

type SocialAuthProfile = {
  provider: string;
  providerUserId: string;
  email: string | null;
  nickname: string | null;
  providerClientId?: string;
  providerRefreshTokenEncrypted?: string;
};

type SignupTokenPayload = Omit<SocialAuthProfile, 'nickname'> & {
  type: 'social-signup';
  platform: string;
};

@Injectable()
class RetryableMailboxAllocationError extends Error {
  constructor() {
    super('MAILBOX_ALLOCATION_RETRY');
  }
}

@Injectable()
export class AuthService {
  private readonly SIGNUP_TOKEN_EXPIRES_IN = '30m';
  private readonly SIGNUP_CREATE_RETRY_LIMIT = 3;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private appleAuthService: AppleAuthService,
  ) {}

  async sendTwilioSMS(phoneNumber: string) {
    const accountSid = this.getRequiredEnvValue(
      'TWILIO_ACCOUNT_SID',
      'Twilio Account SID 설정이 누락되었습니다.',
    );
    const authToken = this.getRequiredEnvValue(
      'TWILIO_AUTH_TOKEN',
      'Twilio Auth Token 설정이 누락되었습니다.',
    );
    const messagingServiceSid = this.getRequiredEnvValue(
      'TWILIO_MESSAGING_SERVICE_SID',
      'Twilio Messaging Service SID 설정이 누락되었습니다.',
    );

    const client = twilio(accountSid, authToken);

    try {
      const verifyCode = Math.floor(Math.random() * (999999 - 100000)) + 100000;
      await client.messages.create({
        body: `[뉴독] 인증번호[${verifyCode}] 타인에게 절대 알려주지 마세요.`,
        messagingServiceSid,
        to: `+82${phoneNumber}`,
      });
      return {
        code: verifyCode,
      };
    } catch (error) {
      console.error(error);
      throw new Error('SMS 요청 실패');
    }
  }

  async socialAuth(body: SocialAuthDto) {
    const profile = await this.authenticateSocialProvider(body);

    const authAccount = await this.prisma.authAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: profile.provider,
          providerUserId: profile.providerUserId,
        },
      },
      include: {
        user: {
          include: {
            interests: true,
          },
        },
      },
    });

    if (authAccount) {
      if (authAccount.user.deletedAt) {
        throw new UnauthorizedException('탈퇴한 계정입니다.');
      }

      await this.updateProviderCredential(authAccount.id, profile);

      const accessToken = await this.issueAccessToken(authAccount.user.id);

      return {
        isRegistered: true,
        accessToken,
        user: this.serializeUser(authAccount.user),
      };
    }

    const signupToken = await this.jwtService.signAsync(
      {
        type: 'social-signup',
        platform: body.platform,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        email: profile.email,
        providerClientId: profile.providerClientId,
        providerRefreshTokenEncrypted: profile.providerRefreshTokenEncrypted,
      } satisfies SignupTokenPayload,
      {
        expiresIn: this.SIGNUP_TOKEN_EXPIRES_IN,
      },
    );

    return {
      isRegistered: false,
      signupToken,
      profile: {
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        email: profile.email,
        nickname: profile.nickname,
      },
    };
  }

  async completeSocialSignup(body: SocialSignupDto) {
    const signupTokenPayload = await this.verifySignupToken(body.signupToken);
    const agreements = new Map(
      body.agreements.map((agreement) => [agreement.type, agreement.agreed]),
    );

    if (agreements.size !== body.agreements.length) {
      throw new BadRequestException('중복된 약관 동의 항목이 있습니다.');
    }

    const consentEntries = Object.entries(USER_CONSENT_POLICY);
    const hasUnknownConsentType = [...agreements.keys()].some(
      (type) => !(type in USER_CONSENT_POLICY),
    );
    const hasMissingConsentType = consentEntries.some(
      ([type]) => !agreements.has(type),
    );

    if (hasUnknownConsentType || hasMissingConsentType) {
      throw new BadRequestException('약관 동의 항목이 올바르지 않습니다.');
    }

    const requiredConsentRejected = consentEntries.some(
      ([type, policy]) => policy.isRequired && !agreements.get(type),
    );

    if (requiredConsentRejected) {
      throw new BadRequestException('필수 약관 동의가 필요합니다.');
    }

    const existingAuthAccount = await this.prisma.authAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: signupTokenPayload.provider,
          providerUserId: signupTokenPayload.providerUserId,
        },
      },
      include: {
        user: {
          include: {
            interests: true,
          },
        },
      },
    });

    if (existingAuthAccount) {
      if (existingAuthAccount.user.deletedAt) {
        throw new UnauthorizedException('탈퇴한 계정입니다.');
      }

      await this.updateProviderCredential(existingAuthAccount.id, {
        provider: signupTokenPayload.provider,
        providerUserId: signupTokenPayload.providerUserId,
        email: signupTokenPayload.email,
        nickname: null,
        providerClientId: signupTokenPayload.providerClientId,
        providerRefreshTokenEncrypted:
          signupTokenPayload.providerRefreshTokenEncrypted,
      });

      const accessToken = await this.issueAccessToken(
        existingAuthAccount.user.id,
      );

      return {
        isRegistered: true,
        accessToken,
        user: this.serializeUser(existingAuthAccount.user),
      };
    }

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

            const createdUser = await tx.user.create({
              data: {
                nickname: body.nickname,
                birthYear: body.birthYear,
                gender: body.gender,
                subscribeEmail: mailbox.email,
                subscribePassword: mailbox.password,
                emailIndex: this.extractEmailIndex(mailbox.email),
                mailboxPool: {
                  connect: {
                    id: mailbox.id,
                  },
                },
              },
            });

            await tx.authAccount.create({
              data: {
                provider: signupTokenPayload.provider,
                providerUserId: signupTokenPayload.providerUserId,
                email: signupTokenPayload.email,
                providerClientId: signupTokenPayload.providerClientId,
                providerRefreshTokenEncrypted:
                  signupTokenPayload.providerRefreshTokenEncrypted,
                userId: createdUser.id,
              },
            });

            await tx.userConsent.createMany({
              data: consentEntries.map(([consentType, policy]) => ({
                userId: createdUser.id,
                consentType,
                isRequired: policy.isRequired,
                isAccepted: agreements.get(consentType),
                consentVersion: policy.version,
                acceptedAt: agreements.get(consentType) ? new Date() : null,
              })),
            });

            return tx.user.findUniqueOrThrow({
              where: {
                id: createdUser.id,
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

        throw error;
      }
    }

    if (!user) {
      throw new ServiceUnavailableException(
        '회원가입용 구독 계정 생성이 지연되고 있습니다. 다시 시도해주세요.',
      );
    }

    const accessToken = await this.issueAccessToken(user.id);

    return {
      isRegistered: true,
      accessToken,
      user: this.serializeUser(user),
    };
  }

  private async authenticateSocialProvider(
    body: SocialAuthDto,
  ): Promise<SocialAuthProfile> {
    if (body.provider === AUTH_PROVIDER.KAKAO) {
      return this.authenticateKakao(body);
    }

    if (body.provider === AUTH_PROVIDER.APPLE) {
      return this.authenticateApple(body);
    }

    throw new BadRequestException('지원하지 않는 소셜 로그인 provider입니다.');
  }

  private async authenticateKakao(body: SocialAuthDto) {
    const { credential } = body;
    let kakaoAccessToken = credential.accessToken;

    if (!kakaoAccessToken) {
      if (!credential.authorizationCode || !credential.redirectUri) {
        throw new BadRequestException(
          '카카오 code 플로우는 authorizationCode와 redirectUri가 필요합니다.',
        );
      }

      const kakaoToken = await this.requestKakaoToken(
        credential.authorizationCode,
        credential.redirectUri,
      );
      kakaoAccessToken = kakaoToken.access_token;
    }

    const kakaoUser = await this.retrieveKakaoUser(kakaoAccessToken);

    return {
      provider: AUTH_PROVIDER.KAKAO,
      providerUserId: kakaoUser.providerUserId,
      email: kakaoUser.email,
      nickname: kakaoUser.nickname,
    };
  }

  private async authenticateApple(body: SocialAuthDto) {
    const { credential } = body;

    if (body.platform === AUTH_PLATFORM.ANDROID) {
      throw new BadRequestException(
        'Apple 로그인은 현재 iOS 또는 Web 플랫폼만 지원합니다.',
      );
    }

    if (!credential.authorizationCode || !credential.idToken) {
      throw new BadRequestException(
        'Apple 로그인은 authorizationCode와 idToken이 필요합니다.',
      );
    }

    if (body.platform === AUTH_PLATFORM.WEB && !credential.redirectUri) {
      throw new BadRequestException(
        'Apple Web 로그인은 redirectUri가 필요합니다.',
      );
    }

    const appleUser = await this.appleAuthService.authenticate(
      credential.authorizationCode,
      credential.idToken,
      body.platform,
      credential.redirectUri,
    );

    return {
      provider: AUTH_PROVIDER.APPLE,
      providerUserId: appleUser.providerUserId,
      email: appleUser.email,
      nickname: null,
      providerClientId: appleUser.clientId,
      providerRefreshTokenEncrypted: appleUser.refreshTokenEncrypted,
    };
  }

  private async updateProviderCredential(
    authAccountId: number,
    profile: SocialAuthProfile,
  ) {
    if (!profile.email && !profile.providerClientId) {
      return;
    }

    await this.prisma.authAccount.update({
      where: { id: authAccountId },
      data: {
        email: profile.email ?? undefined,
        providerClientId: profile.providerClientId,
        providerRefreshTokenEncrypted: profile.providerRefreshTokenEncrypted,
      },
    });
  }

  private async issueAccessToken(userId: number) {
    return this.jwtService.signAsync({ id: userId });
  }

  private async requestKakaoToken(code: string, redirectUri: string) {
    const clientId = this.getRequiredEnvValue(
      'KAKAO_REST_API_KEY',
      '카카오 로그인 REST API 키 설정이 완료되지 않았습니다.',
    );
    const clientSecret = this.configService.get<string>('KAKAO_CLIENT_SECRET');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code,
    });

    if (clientSecret) {
      body.set('client_secret', clientSecret);
    }

    const response = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new UnauthorizedException(
        `카카오 토큰 요청에 실패했습니다. ${errorText}`,
      );
    }

    return (await response.json()) as KakaoTokenResponse;
  }

  private async retrieveKakaoUser(
    accessToken: string,
  ): Promise<KakaoUserProfile> {
    const response = await fetch('https://kapi.kakao.com/v2/user/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new UnauthorizedException(
        `카카오 사용자 정보 조회에 실패했습니다. ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      id?: number | string;
      properties?: {
        nickname?: string;
      };
      kakao_account?: {
        email?: string;
      };
    };

    if (!data.id) {
      throw new UnauthorizedException(
        '카카오 사용자 고유 식별값을 가져오지 못했습니다.',
      );
    }

    return {
      providerUserId: String(data.id),
      email: data.kakao_account?.email ?? null,
      nickname: data.properties?.nickname ?? null,
    };
  }

  private async verifySignupToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<SignupTokenPayload>(
        token,
      );

      if (payload.type !== 'social-signup') {
        throw new UnauthorizedException(
          '회원가입 토큰 유형이 올바르지 않습니다.',
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('회원가입 토큰이 유효하지 않습니다.');
    }
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

  private serializeUser(user: {
    id: number;
    loginId: string | null;
    phoneNumber: string | null;
    subscribeEmail: string;
    nickname: string;
    birthYear: string;
    gender: string;
    createdAt: Date;
    industryId: number | null;
    interests?: Array<{ interestId: number; createdAt: Date; userId: number }>;
  }) {
    return {
      id: user.id,
      loginId: user.loginId,
      phoneNumber: user.phoneNumber,
      subscribeEmail: user.subscribeEmail,
      nickname: user.nickname,
      birthYear: user.birthYear,
      gender: user.gender,
      createdAt: user.createdAt,
      industryId: user.industryId,
      interests: user.interests ?? [],
      hasCompletedOnboarding:
        Boolean(user.industryId) && (user.interests?.length ?? 0) > 0,
    };
  }

  private getRequiredEnvValue(key: string, message: string) {
    const value = this.configService.get<string>(key);

    if (!value) {
      throw new ServiceUnavailableException(message);
    }

    return value;
  }
}
