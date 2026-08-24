import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { simpleParser, ParsedMail } from 'mailparser';
import Pop3Command from 'node-pop3';
import { parse } from 'node-html-parser';
import { Newsletter } from '@prisma/client';
import { SUBSCRIPTION_STATUS } from '../newsletters/constants/subscription-status';
import { ARTICLE_STATUS } from './constants/article-status';
import {
  UNMATCHED_MAIL_STATUS,
  UnmatchedMailStatus,
} from './constants/unmatched-mail-status';
import { isPrismaKnownRequestError } from '../common/utils/prisma-error.util';

// RETR 실패(특히 타임아웃) 후에는 같은 POP3 연결의 명령-응답 짝이 어긋날 수 있어
// (늦게 도착한 응답이 다음 명령의 응답으로 오인됨) 세션을 더 신뢰할 수 없다.
// 이 에러는 해당 유저의 이번 사이클 세션을 중단시키는 신호로 사용한다.
class Pop3SessionAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Pop3SessionAbortError';
  }
}

@Injectable()
export class ArticlesService {
  constructor(private prisma: PrismaService) {}

  // POP3 작업 동시 실행 방지 플래그
  private isPop3Running = false;
  private readonly POP3_COMMAND_TIMEOUT_MS = 30_000;
  private readonly MAIL_PARSE_TIMEOUT_MS = 30_000;
  private readonly DB_COMMAND_TIMEOUT_MS = 15_000;
  private readonly POP3_QUIT_TIMEOUT_MS = 10_000;
  // 같은 메일이 연속 실패하면 회수 불가로 주차해 사이클을 막지 않기 위한 상한
  private readonly MAIL_FAIL_LIMIT = 3;
  private readonly mailFailCounts = new Map<string, number>();

  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string,
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} timeout after ${ms}ms`));
      }, ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  // POP3 프로토콜 로직
  // UIDL(메일 고유 ID) 기반 수집: 처리 여부를 아티클 개수가 아니라 신원(uidl)으로 판단한다.
  // 미등록 발신자 메일은 UnmatchedMail(주차장)에 보류하고, 발신자 등록 시 다음 사이클에서 자동 회수한다.
  async POP3() {
    // 이미 POP3 작업이 실행 중이면 새 요청은 무시
    if (this.isPop3Running) {
      console.log('[POP3] 작업이 이미 실행 중이어서 새 요청을 건너뜁니다.');
      return { message: 'POP3 작업이 이미 실행 중입니다.' };
    }

    this.isPop3Running = true;
    try {
      const allUser = await this.prisma.user.findMany({
        where: {
          deletedAt: null,
        },
        select: {
          id: true,
          subscribeEmail: true,
          subscribePassword: true,
        },
      });

      // 유저 단위 병렬 처리 (배치 병렬 처리로 전체 속도 개선)
      const CONCURRENCY = 3;

      for (let i = 0; i < allUser.length; i += CONCURRENCY) {
        const batch = allUser.slice(i, i + CONCURRENCY);
        await Promise.allSettled(
          batch.map((user) => this.collectUserMailbox(user)),
        );
      }

      return { message: 'POP3 작업이 완료되었습니다.' };
    } finally {
      this.isPop3Running = false;
    }
  }

  private async collectUserMailbox(user: {
    id: number;
    subscribeEmail: string;
    subscribePassword: string;
  }) {
    const label = user.subscribeEmail;
    // iwinv 웹메일 서비스 개편으로 POP3S(TLS) 연결 사용
    const pop3 = new Pop3Command({
      user: user.subscribeEmail,
      password: user.subscribePassword,
      host: 'mail.newdok.store',
      port: 995,
      tls: true,
    });

    try {
      console.log(`[POP3] 유저 ${label} 처리 시작`);

      // UIDL 응답: [메일번호, uidl] 쌍의 목록
      const uidlList = (await this.withTimeout(
        pop3.UIDL(),
        this.POP3_COMMAND_TIMEOUT_MS,
        `[POP3] ${label} UIDL`,
      )) as string[][];

      // 레거시 아티클(uidl 미기록) 1회 백필. 실패 시 중복 저장 방지를 위해 이 유저 수집을 건너뛴다.
      const backfillOk = await this.ensureUidlBackfill(
        user.id,
        label,
        uidlList,
        pop3,
      );
      if (!backfillOk) {
        return;
      }

      const [savedUidls, parkedUidls] = await Promise.all([
        this.withTimeout(
          this.prisma.article.findMany({
            where: { userId: user.id, uidl: { not: null } },
            select: { uidl: true },
          }),
          this.DB_COMMAND_TIMEOUT_MS,
          `[POP3] ${label} 저장 uidl 조회`,
        ),
        this.withTimeout(
          this.prisma.unmatchedMail.findMany({
            where: { userId: user.id },
            select: { uidl: true },
          }),
          this.DB_COMMAND_TIMEOUT_MS,
          `[POP3] ${label} 주차 uidl 조회`,
        ),
      ]);
      const knownUidls = new Set<string>([
        ...savedUidls.map((article) => article.uidl as string),
        ...parkedUidls.map((mail) => mail.uidl),
      ]);

      console.log(
        `[POP3] 유저 ${label} 메일 ${uidlList.length}개 / 처리됨 ${knownUidls.size}개`,
      );

      let saved = 0;
      let parked = 0;
      let sessionAborted = false;
      for (const [msgNumber, uidl] of uidlList) {
        if (!uidl || knownUidls.has(uidl)) {
          continue;
        }

        try {
          const parsedEmail = await this.fetchAndParseMail(
            pop3,
            msgNumber,
            label,
          );
          const address = parsedEmail.from?.value?.[0]?.address?.trim();

          if (!address) {
            // 발신자 주소가 없는 메일은 매칭이 영구히 불가능하므로 회수 불가로 주차
            await this.parkUnmatchedMail(
              user.id,
              uidl,
              '(발신자 없음)',
              parsedEmail,
              UNMATCHED_MAIL_STATUS.UNRECOVERABLE,
            );
            parked++;
            continue;
          }

          const newsletter = await this.matchNewsletterBySender(
            address,
            label,
          );
          if (!newsletter) {
            // 미등록 발신자: 에러로 중단하지 않고 주차 후 다음 메일 진행
            await this.parkUnmatchedMail(user.id, uidl, address, parsedEmail);
            parked++;
            continue;
          }

          await this.saveArticleFromMail(
            user.id,
            label,
            newsletter,
            parsedEmail,
            uidl,
          );
          saved++;
          this.mailFailCounts.delete(`${user.id}:${uidl}`);
        } catch (error) {
          // 메일 1건 실패는 기록 후 재시도(다음 사이클)하되, 연속 실패가 상한에
          // 도달하면 회수 불가로 주차해 더 이상 사이클을 막지 않는다.
          const parkedAsFailed = await this.recordMailFailure(
            user.id,
            label,
            uidl,
            error,
          );
          if (parkedAsFailed) {
            parked++;
          }
          if (error instanceof Pop3SessionAbortError) {
            // RETR 실패 후에는 연결의 명령-응답 짝을 신뢰할 수 없어
            // 다른 메일이 잘못된 uidl로 저장되는 것을 막기 위해 세션을 끝낸다.
            sessionAborted = true;
            break;
          }
        }
      }

      // 주차장 재점검: 그 사이 등록된 발신자의 보류 메일 회수.
      // 세션이 중단됐으면 연결을 신뢰할 수 없으므로 이번 사이클은 건너뛴다.
      const recovered = sessionAborted
        ? 0
        : await this.recoverParkedMails(user.id, label, pop3, uidlList);

      await this.logCycleSummary(user.id, label, { saved, parked, recovered });
    } catch (error) {
      console.error(
        `[POP3] 유저 ${label} 처리 중 에러:`,
        this.getErrorMessage(error),
      );
    } finally {
      try {
        await this.withTimeout(
          pop3.QUIT(),
          this.POP3_QUIT_TIMEOUT_MS,
          `[POP3] ${label} QUIT`,
        );
        console.log(`[POP3] 유저 ${label} 연결 종료 완료`);
      } catch (error) {
        console.error(
          `[POP3] 유저 ${label} QUIT 중 에러:`,
          this.getErrorMessage(error),
        );
      }
    }
  }

  // 레거시 아티클 uidl 백필: "id 오름차순 i번째 아티클 = 메일함 i번째 메일" 불변식 기반 1회 마이그레이션.
  // 불변식이 깨진 유저는 수집을 중단(false)해 중복 저장을 방지한다.
  private async ensureUidlBackfill(
    userId: number,
    label: string,
    uidlList: string[][],
    pop3: Pop3Command,
  ): Promise<boolean> {
    const nullCount = await this.withTimeout(
      this.prisma.article.count({ where: { userId, uidl: null } }),
      this.DB_COMMAND_TIMEOUT_MS,
      `[POP3] ${label} 백필 대상 조회`,
    );
    if (nullCount === 0) {
      return true;
    }

    const articles = await this.withTimeout(
      this.prisma.article.findMany({
        where: { userId },
        orderBy: { id: 'asc' },
        select: { id: true, uidl: true, title: true, date: true },
      }),
      this.DB_COMMAND_TIMEOUT_MS,
      `[POP3] ${label} 백필 아티클 조회`,
    );

    if (articles.length > uidlList.length) {
      console.error(
        `[POP3] 유저 ${label} uidl 백필 불가: 아티클 ${articles.length}개 > 메일 ${uidlList.length}개. 이 유저 수집을 건너뜁니다.`,
      );
      return false;
    }

    const plans: { id: number; uidl: string }[] = [];
    for (let idx = 0; idx < articles.length; idx++) {
      const targetUidl = uidlList[idx]?.[1];
      if (!targetUidl) {
        console.error(
          `[POP3] 유저 ${label} uidl 백필 불가: ${idx + 1}번째 메일의 uidl이 비어 있습니다.`,
        );
        return false;
      }
      if (articles[idx].uidl === null) {
        plans.push({ id: articles[idx].id, uidl: targetUidl });
      } else if (articles[idx].uidl !== targetUidl) {
        console.error(
          `[POP3] 유저 ${label} uidl 백필 불일치(article ${articles[idx].id}). 이 유저 수집을 건너뜁니다.`,
        );
        return false;
      }
    }

    // 표본 검증: 위치 대응이 실제 메일함과 일치하는지 첫/마지막 위치의 메일을
    // 직접 내려받아 제목·날짜를 대조한다. 과거 메일함 중간 삭제 등으로 불변식이
    // 조용히 깨진 유저의 오배정(중복 저장 + 영구 누락)을 백필 확정 전에 차단한다.
    const sampleIndexes = [...new Set([0, articles.length - 1])];
    for (const idx of sampleIndexes) {
      const [msgNumber] = uidlList[idx];
      const parsedEmail = await this.fetchAndParseMail(pop3, msgNumber, label);
      const expectedTitle = (parsedEmail.subject || '제목 없음').slice(0, 191);
      const titleMatch = articles[idx].title === expectedTitle;
      const dateMatch = parsedEmail.date
        ? new Date(parsedEmail.date).getTime() === articles[idx].date.getTime()
        : false;
      if (!titleMatch && !dateMatch) {
        console.error(
          `[POP3] 유저 ${label} 백필 표본 검증 실패(위치 ${idx + 1}): 메일함과 아티클 이력이 어긋납니다. 이 유저 수집을 건너뜁니다.`,
        );
        return false;
      }
    }

    // 대량 백필 대비: CASE 벌크 업데이트로 왕복 횟수 최소화.
    // MySQL 문자열 리터럴에서 특수 의미를 갖는 백슬래시와 작은따옴표를 모두 이스케이프한다.
    const escapeSqlString = (value: string) =>
      value.replace(/\\/g, '\\\\').replace(/'/g, "''");
    const CHUNK = 300;
    for (let i = 0; i < plans.length; i += CHUNK) {
      const chunk = plans.slice(i, i + CHUNK);
      const cases = chunk
        .map((p) => `WHEN ${p.id} THEN '${escapeSqlString(p.uidl)}'`)
        .join(' ');
      const ids = chunk.map((p) => p.id).join(',');
      await this.withTimeout(
        this.prisma.$executeRawUnsafe(
          `UPDATE Article SET uidl = CASE id ${cases} END WHERE id IN (${ids})`,
        ),
        this.DB_COMMAND_TIMEOUT_MS,
        `[POP3] ${label} 백필 벌크 업데이트`,
      );
    }

    console.log(
      `[POP3] 유저 ${label} 레거시 아티클 ${plans.length}건 uidl 백필 완료`,
    );
    return true;
  }

  private async fetchAndParseMail(
    pop3: Pop3Command,
    msgNumber: string,
    label: string,
  ): Promise<ParsedMail> {
    let rawEmail: string;
    try {
      rawEmail = (await this.withTimeout(
        pop3.RETR(Number(msgNumber)),
        this.POP3_COMMAND_TIMEOUT_MS,
        `[POP3] ${label} RETR ${msgNumber}`,
      )) as string;
    } catch (error) {
      // RETR 실패는 세션 중단 신호로 승격 (연결 desync로 인한 오저장 방지)
      throw new Pop3SessionAbortError(this.getErrorMessage(error));
    }

    return this.withTimeout(
      simpleParser(rawEmail),
      this.MAIL_PARSE_TIMEOUT_MS,
      `[POP3] ${label} parse ${msgNumber}`,
    );
  }

  // 메일 1건 실패 기록. 연속 실패가 상한(MAIL_FAIL_LIMIT)에 도달하면 회수 불가로
  // 주차해(이미 주차된 메일이면 상태 전환) 더 이상 사이클을 막지 않는다.
  // 반환값: 이번 호출에서 주차(신규)했는지 여부.
  private async recordMailFailure(
    userId: number,
    label: string,
    uidl: string,
    error: unknown,
  ): Promise<boolean> {
    const failKey = `${userId}:${uidl}`;
    const failCount = (this.mailFailCounts.get(failKey) ?? 0) + 1;
    this.mailFailCounts.set(failKey, failCount);

    if (failCount < this.MAIL_FAIL_LIMIT) {
      console.error(
        `[POP3] 유저 ${label} 메일(uidl=${uidl}) 처리 실패(${failCount}회):`,
        this.getErrorMessage(error),
      );
      return false;
    }

    this.mailFailCounts.delete(failKey);
    try {
      await this.withTimeout(
        this.prisma.unmatchedMail.upsert({
          where: { userId_uidl: { userId, uidl } },
          update: { status: UNMATCHED_MAIL_STATUS.UNRECOVERABLE },
          create: {
            userId,
            uidl,
            senderAddress: '(수신 실패)',
            subject: null,
            receivedAt: null,
            status: UNMATCHED_MAIL_STATUS.UNRECOVERABLE,
          },
        }),
        this.DB_COMMAND_TIMEOUT_MS,
        `[POP3] ${label} 실패 메일 주차 ${uidl}`,
      );
      console.error(
        `[POP3] 유저 ${label} 메일(uidl=${uidl}) ${failCount}회 연속 실패 → 회수 불가로 주차:`,
        this.getErrorMessage(error),
      );
      return true;
    } catch (parkError) {
      console.error(
        `[POP3] 유저 ${label} 실패 메일 주차 실패(uidl=${uidl}):`,
        this.getErrorMessage(parkError),
      );
      return false;
    }
  }

  // 발신자 이메일 → 뉴스레터 매칭 (NewsletterSenderEmail 명부 단건 조회)
  private async matchNewsletterBySender(address: string, label: string) {
    const sender = await this.withTimeout(
      this.prisma.newsletterSenderEmail.findUnique({
        where: { email: address },
        include: { newsletter: true },
      }),
      this.DB_COMMAND_TIMEOUT_MS,
      `[POP3] ${label} sender lookup ${address}`,
    );

    return sender?.newsletter ?? null;
  }

  private async parkUnmatchedMail(
    userId: number,
    uidl: string,
    senderAddress: string,
    parsedEmail: ParsedMail | null,
    status: UnmatchedMailStatus = UNMATCHED_MAIL_STATUS.PENDING,
  ) {
    await this.withTimeout(
      this.prisma.unmatchedMail.upsert({
        where: { userId_uidl: { userId, uidl } },
        update: {},
        create: {
          userId,
          uidl,
          // VarChar(191) 초과로 인한 주차 실패(P2000) 방지
          senderAddress: senderAddress.slice(0, 191),
          subject: parsedEmail?.subject ? parsedEmail.subject.slice(0, 191) : null,
          receivedAt: parsedEmail?.date ?? null,
          status,
        },
      }),
      this.DB_COMMAND_TIMEOUT_MS,
      `[POP3] park ${uidl}`,
    );
  }

  private async saveArticleFromMail(
    userId: number,
    label: string,
    newsletter: Newsletter,
    parsedEmail: ParsedMail,
    uidl: string,
  ) {
    // 아티클 수신 날짜 UTC to KST 변환
    const KR_TIME_DIFF = 9 * 60 * 60 * 1000;
    const utcDate = new Date(parsedEmail.date ?? Date.now());
    const kstDate = new Date(utcDate.getTime() + KR_TIME_DIFF);

    const stringifyHTML = (parsedEmail.html || parsedEmail.text || '') as string;

    // 본문 미리보기 텍스트 생성
    const firstTwoBody = await this.extractTwoSentenceOfArticle(stringifyHTML);
    // 아티클 본문에서 순수 텍스트 추출
    const plainBody = stringifyHTML
      .replace(/<style[^>]*>@media[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let article;
    try {
      article = await this.withTimeout(
        this.prisma.article.create({
          data: {
            // VarChar(191) 초과로 인한 저장 실패(P2000) 방지
            title: (parsedEmail.subject || '제목 없음').slice(0, 191),
            body: stringifyHTML,
            firstTwoBody: firstTwoBody || '',
            plainBody,
            date: utcDate,
            publishYear: kstDate.getUTCFullYear(),
            publishMonth: kstDate.getUTCMonth() + 1,
            publishDate: kstDate.getUTCDate(),
            userId,
            newsletterId: newsletter.id,
            uidl,
          },
        }),
        this.DB_COMMAND_TIMEOUT_MS,
        `[POP3] ${label} article create ${uidl}`,
      );
    } catch (error) {
      // (userId, uidl) unique 충돌 = 이미 저장된 메일(재시도/경합) → 중복 저장 방지가 동작한 것이므로 무시
      if (isPrismaKnownRequestError(error) && error.code === 'P2002') {
        console.log(`[POP3] 유저 ${label} 이미 저장된 메일 스킵(uidl=${uidl})`);
        return;
      }
      throw error;
    }

    console.log(
      `[POP3] 유저 ${label} 아티클 저장 완료: ${article.id} (${newsletter.brandName})`,
    );

    // 수신한 아티클 뉴스레터 구독 상태에 따른 처리
    const isSubscribed = await this.withTimeout(
      this.prisma.newslettersOnUsers.findUnique({
        where: {
          userId_newsletterId: {
            userId,
            newsletterId: newsletter.id,
          },
        },
      }),
      this.DB_COMMAND_TIMEOUT_MS,
      `[POP3] ${label} subscription lookup ${newsletter.id}`,
    );
    // 1. "구독 전" 뉴스레터인 경우
    if (!isSubscribed) {
      await this.withTimeout(
        this.prisma.newslettersOnUsers.upsert({
          where: {
            userId_newsletterId: {
              userId,
              newsletterId: newsletter.id,
            },
          },
          update: {},
          create: {
            userId,
            newsletterId: newsletter.id,
            status:
              newsletter.doubleCheck === true
                ? SUBSCRIPTION_STATUS.CHECK
                : SUBSCRIPTION_STATUS.CONFIRMED,
          },
        }),
        this.DB_COMMAND_TIMEOUT_MS,
        `[POP3] ${label} subscription upsert ${newsletter.id}`,
      );
    }
    // 2. "구독 확인 중" 뉴스레터인 경우
    if (isSubscribed && isSubscribed.status === SUBSCRIPTION_STATUS.CHECK) {
      await this.withTimeout(
        this.prisma.newslettersOnUsers.update({
          where: {
            userId_newsletterId: {
              userId,
              newsletterId: newsletter.id,
            },
          },
          data: {
            status: SUBSCRIPTION_STATUS.CONFIRMED,
          },
        }),
        this.DB_COMMAND_TIMEOUT_MS,
        `[POP3] ${label} subscription confirm ${newsletter.id}`,
      );
    }
    // 3. "구독 중지 중" 뉴스레터인 경우
    if (isSubscribed && isSubscribed.status === SUBSCRIPTION_STATUS.PAUSED) {
      await this.withTimeout(
        this.prisma.article.update({
          where: {
            id: article.id,
          },
          data: {
            isVisible: false,
          },
        }),
        this.DB_COMMAND_TIMEOUT_MS,
        `[POP3] ${label} article hide ${article.id}`,
      );
    }
  }

  // 주차장 재점검: PENDING 메일 중 발신자가 그 사이 등록된 것만 골라 회수한다.
  // 평상시엔 DB 조회 1~2회로 끝나고, 매칭된 메일만 메일함에서 다시 가져온다.
  private async recoverParkedMails(
    userId: number,
    label: string,
    pop3: Pop3Command,
    uidlList: string[][],
  ): Promise<number> {
    const pending = await this.withTimeout(
      this.prisma.unmatchedMail.findMany({
        where: { userId, status: UNMATCHED_MAIL_STATUS.PENDING },
      }),
      this.DB_COMMAND_TIMEOUT_MS,
      `[POP3] ${label} 주차장 조회`,
    );
    if (pending.length === 0) {
      return 0;
    }

    const senders = [...new Set(pending.map((mail) => mail.senderAddress))];
    const registered = await this.withTimeout(
      this.prisma.newsletterSenderEmail.findMany({
        where: { email: { in: senders } },
        include: { newsletter: true },
      }),
      this.DB_COMMAND_TIMEOUT_MS,
      `[POP3] ${label} 명부 대조`,
    );
    if (registered.length === 0) {
      return 0;
    }

    const newsletterBySender = new Map(
      registered.map((row) => [row.email.toLowerCase(), row.newsletter]),
    );
    const msgNumberByUidl = new Map(
      uidlList.map(([msgNumber, uidl]) => [uidl, msgNumber]),
    );

    let recovered = 0;
    for (const mail of pending) {
      const newsletter = newsletterBySender.get(
        mail.senderAddress.toLowerCase(),
      );
      if (!newsletter) {
        continue;
      }

      const msgNumber = msgNumberByUidl.get(mail.uidl);
      if (!msgNumber) {
        // 원본 메일이 메일함에서 사라져 회수 불가 — 조용히 사라지지 않도록 상태로 남긴다
        await this.withTimeout(
          this.prisma.unmatchedMail.update({
            where: { id: mail.id },
            data: { status: UNMATCHED_MAIL_STATUS.UNRECOVERABLE },
          }),
          this.DB_COMMAND_TIMEOUT_MS,
          `[POP3] ${label} 회수 불가 표시 ${mail.uidl}`,
        );
        console.error(
          `[POP3] 유저 ${label} 회수 불가(메일함에 원본 없음): ${mail.senderAddress} uidl=${mail.uidl}`,
        );
        continue;
      }

      try {
        const parsedEmail = await this.fetchAndParseMail(
          pop3,
          msgNumber,
          label,
        );
        await this.saveArticleFromMail(
          userId,
          label,
          newsletter,
          parsedEmail,
          mail.uidl,
        );
        await this.withTimeout(
          this.prisma.unmatchedMail.delete({ where: { id: mail.id } }),
          this.DB_COMMAND_TIMEOUT_MS,
          `[POP3] ${label} 주차 해제 ${mail.uidl}`,
        );
        recovered++;
        this.mailFailCounts.delete(`${userId}:${mail.uidl}`);
        console.log(
          `[POP3] 유저 ${label} 주차 메일 회수: ${mail.senderAddress} → ${newsletter.brandName}`,
        );
      } catch (error) {
        // 회수 실패는 기록 후 주차 상태를 유지해 다음 사이클에 재시도.
        // 연속 실패 상한 도달 시 recordMailFailure가 회수 불가로 전환한다.
        await this.recordMailFailure(userId, label, mail.uidl, error);
        if (error instanceof Pop3SessionAbortError) {
          // 연결 신뢰 불가 → 남은 회수는 다음 사이클로 미룬다
          break;
        }
      }
    }

    return recovered;
  }

  // 사이클 요약 로그: 미등록 발신자를 종류별로 1줄 요약 (운영자가 pm2 logs로 바로 파악)
  private async logCycleSummary(
    userId: number,
    label: string,
    counts: { saved: number; parked: number; recovered: number },
  ) {
    console.log(
      `[POP3] 유저 ${label} 신규 저장 ${counts.saved}건 / 회수 ${counts.recovered}건 / 신규 주차 ${counts.parked}건`,
    );

    const pending = await this.withTimeout(
      this.prisma.unmatchedMail.findMany({
        where: { userId, status: UNMATCHED_MAIL_STATUS.PENDING },
        orderBy: { id: 'desc' },
        select: { senderAddress: true, subject: true },
      }),
      this.DB_COMMAND_TIMEOUT_MS,
      `[POP3] ${label} 요약 집계`,
    );
    if (pending.length === 0) {
      return;
    }

    const bySender = new Map<string, { count: number; subject: string | null }>();
    for (const mail of pending) {
      const entry = bySender.get(mail.senderAddress);
      if (entry) {
        entry.count++;
      } else {
        bySender.set(mail.senderAddress, {
          count: 1,
          subject: mail.subject,
        });
      }
    }

    const parts = [...bySender.entries()].map(
      ([address, { count, subject }]) =>
        `${address}(${count}통${subject ? `, "${subject.slice(0, 24)}"` : ''})`,
    );
    console.log(
      `[POP3] 유저 ${label} 미등록 발신자 대기 ${bySender.size}종: ${parts.join(', ')}`,
    );
  }

  // 운영용: 수집 보류 메일을 상태·발신자별로 집계해 반환.
  // - pending: 발신자 등록 대기 (등록하면 다음 사이클에 자동 회수)
  // - unrecoverable: 회수 불가 (원본 소실/수신 실패). 재시도하려면 해당 row를
  //   삭제하면 다음 사이클에 재수집을 시도한다.
  async getUnmatchedSenders() {
    const mails = await this.prisma.unmatchedMail.findMany({
      orderBy: { id: 'desc' },
      include: { user: { select: { subscribeEmail: true } } },
    });

    const groupByStatus = (status: UnmatchedMailStatus) => {
      const bySender = new Map<
        string,
        {
          senderAddress: string;
          count: number;
          sampleSubject: string | null;
          latestReceivedAt: Date | null;
          mailboxes: Set<string>;
        }
      >();

      for (const mail of mails) {
        if (mail.status !== status) {
          continue;
        }
        const entry = bySender.get(mail.senderAddress);
        if (entry) {
          entry.count++;
          entry.mailboxes.add(mail.user.subscribeEmail);
        } else {
          bySender.set(mail.senderAddress, {
            senderAddress: mail.senderAddress,
            count: 1,
            sampleSubject: mail.subject,
            latestReceivedAt: mail.receivedAt,
            mailboxes: new Set([mail.user.subscribeEmail]),
          });
        }
      }

      return [...bySender.values()].map((entry) => ({
        senderAddress: entry.senderAddress,
        count: entry.count,
        sampleSubject: entry.sampleSubject,
        latestReceivedAt: entry.latestReceivedAt,
        mailboxes: [...entry.mailboxes],
      }));
    };

    const pending = groupByStatus(UNMATCHED_MAIL_STATUS.PENDING);
    const unrecoverable = groupByStatus(UNMATCHED_MAIL_STATUS.UNRECOVERABLE);

    return {
      totalPending: mails.filter(
        (mail) => mail.status === UNMATCHED_MAIL_STATUS.PENDING,
      ).length,
      pending,
      unrecoverable,
    };
  }

  // 날짜별 아티클 조회
  async getArticlesByDate(
    year: string,
    publicationMonth: string,
    userId: number,
  ) {
    const articles = await this.prisma.article.findMany({
      where: {
        AND: [
          { isVisible: true },
          { publishYear: parseInt(year) },
          { publishMonth: parseInt(publicationMonth) },
          { userId },
        ],
      },
      select: {
        title: true,
        publishDate: true,
        status: true,
      },
    });

    // 날짜별 아티클 존재 여부 및 개수 계산
    const resultByDate = Array(31)
      .fill(null)
      .map(() => ({
        hasArticles: false,
        totalCount: 0,
        unreadCount: 0,
      }));

    articles.forEach((article) => {
      const idx = article.publishDate - 1;
      if (idx < 0 || idx >= 31) return;

      resultByDate[idx].hasArticles = true;
      resultByDate[idx].totalCount++;
      if (article.status === ARTICLE_STATUS.UNREAD) {
        resultByDate[idx].unreadCount++;
      }
    });

    return {
      data: resultByDate.map((data, index) => ({
        publishDate: index + 1,
        hasArticles: data.hasArticles,
        totalCount: data.totalCount,
        unreadCount: data.unreadCount,
      })),
    };
  }

  // 오늘 날짜 아티클 조회
  async getTodayArticles(userId: number) {
    const todayDate = new Date();

    const todayArticles = await this.prisma.article.findMany({
      where: {
        AND: [
          { isVisible: true },
          { publishYear: todayDate.getFullYear() },
          { publishMonth: todayDate.getMonth() + 1 },
          { publishDate: todayDate.getDate() },
          { userId },
        ],
      },
      select: {
        id: true,
        title: true,
        publishDate: true,
        status: true,
        newsletter: {
          select: {
            brandName: true,
            imageUrl: true,
          },
        },
      },
    });

    return todayArticles;
  }

  // 특정 일자 아티클 조회
  async getArticlesByDay(
    year: string,
    publicationMonth: string,
    publicationDate: string,
    userId: number,
  ) {
    const articles = await this.prisma.article.findMany({
      where: {
        AND: [
          { isVisible: true },
          { publishYear: parseInt(year, 10) },
          { publishMonth: parseInt(publicationMonth, 10) },
          { publishDate: parseInt(publicationDate, 10) },
          { userId },
        ],
      },
      select: {
        id: true,
        title: true,
        publishDate: true,
        status: true,
        newsletter: {
          select: {
            brandName: true,
            imageUrl: true,
          },
        },
      },
    });

    return articles;
  }

  // 아티클 읽기
  async getArticleById(articleId: string) {
    const article = await this.prisma.article.update({
      where: {
        id: parseInt(articleId),
      },
      data: {
        status: ARTICLE_STATUS.READ,
      },
      include: { newsletter: true },
    });

    const data = {
      articleTitle: article.title,
      articleid: article.id,
      date: article.date,
      brandId: article.newsletter.id,
      brandName: article.newsletter.brandName,
      articleHTML: article.body,
      brandImageUrl: article.newsletter.imageUrl,
      isBookmarked: article.isBookmarked,
    };
    return data;
  }

  // 아티클 삭제
  async deleteArticleById(articleId: string) {
    const deletedArticle = await this.prisma.article.delete({
      where: {
        id: parseInt(articleId),
      },
    });

    return deletedArticle;
  }

  // 아티클 전체 삭제
  async deleteArticles() {
    const deletedArticles = await this.prisma.article.deleteMany();

    return deletedArticles;
  }

  // 유저의 총 수신 아티클 개수
  async calNumOfReceivedArticles(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        _count: {
          select: { articles: true },
        },
      },
    });

    return user._count.articles;
  }

  // 아티클 미리보기 본문 추출
  async extractTwoSentenceOfArticle(articleBody: string) {
    const root = parse(articleBody);

    const selectedElements = root.querySelectorAll(
      '.stb-fore-colored, .stb-bold',
    );
    const elements =
      selectedElements.length === 0
        ? root.getElementsByTagName('*')
        : selectedElements;

    const filteredElements = elements.filter((element) => {
      const style = element.getAttribute('style');
      const hasColorStyle = style && style.includes('color');
      const isBlackText = style && style.includes('color: #000000;');

      const hasHref = element.getAttribute('href');

      const isValidText =
        /[가-힣]/.test(element.text) && element.text.length > 10;

      return !hasHref && (!hasColorStyle || isBlackText) && isValidText;
    });

    return filteredElements.length > 2
      ? filteredElements[1].text + ' ' + filteredElements[2].text
      : filteredElements[0]?.text;
  }

  // 아티클 북마크 요청 및 취소
  async bookmarkArticle(articleId: string, userId: number) {
    const parsedArticleId = parseInt(articleId);

    // 현재 북마크 상태 확인
    const existingBookmark = await this.prisma.bookmark.findUnique({
      where: {
        userId_articleId: {
          userId,
          articleId: parsedArticleId,
        },
      },
    });

    if (existingBookmark) {
      // 북마크 삭제 + Article 업데이트 병렬 처리
      await Promise.all([
        this.prisma.bookmark.delete({
          where: {
            userId_articleId: {
              userId,
              articleId: parsedArticleId,
            },
          },
        }),
        this.prisma.article.update({
          where: { id: parsedArticleId },
          data: { isBookmarked: false },
        }),
      ]);

      return { isBookmarked: false };
    } else {
      // 북마크 추가 + Article 업데이트 병렬 처리
      await Promise.all([
        this.prisma.bookmark.create({
          data: {
            userId,
            articleId: parsedArticleId,
          },
        }),
        this.prisma.article.update({
          where: { id: parsedArticleId },
          data: { isBookmarked: true },
        }),
      ]);

      return { isBookmarked: true };
    }
  }

  // 북마크한 아티클 관심사 조회
  async getUserBookmarkedInterests(userId: number) {
    let bookmarkedInterestIds = [];

    const bookmarks = await this.prisma.bookmark.findMany({
      where: {
        userId,
      },
    });
    const bookmarkedArticleIds = bookmarks.map((bookmark) => {
      return bookmark.articleId;
    });

    const promises = bookmarkedArticleIds.map(async (articleId) => {
      const article = await this.prisma.article.findUnique({
        where: {
          id: articleId,
        },
        select: {
          id: true,
          newsletter: {
            select: {
              interests: {
                orderBy: {
                  id: 'asc',
                },
              },
            },
          },
        },
      });

      // null 체크 추가
      if (article && article.newsletter && article.newsletter.interests) {
        article.newsletter.interests.forEach((interest) => {
          bookmarkedInterestIds.push({
            id: interest.id,
            name: interest.name,
          });
        });
      }
    });
    await Promise.all(promises);

    // 관심사 id를 기준으로 중복 제거 후, 오름차순 정렬
    bookmarkedInterestIds = [
      ...new Map(
        bookmarkedInterestIds.map((interest) => [interest.id, interest]),
      ).values(),
    ].sort((a, b) => a.id - b.id);

    return { data: bookmarkedInterestIds };
  }

  // 북마크한 아티클 조회
  async getBookmarkedArticles(
    interestId: string,
    sortBy: string,
    userId: number,
  ) {
    let bookmarkedArticlesForInterest = [];

    // 정렬 기준 기본값 설정
    const sortBy_default = sortBy || 'bookmark_date'; // 기본값: 북마크 추가순
    const useBookmarkDateForGrouping = sortBy_default === 'bookmark_date'; // 북마크 추가일 기준 여부

    const bookmark = await this.prisma.bookmark.findMany({
      where: {
        userId,
      },
      select: {
        createdAt: true, // 북마크 추가 시점
        article: {
          select: {
            id: true,
            title: true,
            firstTwoBody: true,
            date: true, // 아티클 수신 시점
            newsletter: {
              select: {
                id: true,
                brandName: true,
                imageUrl: true,
                interests: {
                  select: {
                    id: true,
                  },
                  orderBy: {
                    id: 'asc',
                  },
                },
              },
            },
          },
        },
      },
    });

    // 선택된 관심사 id가 있으면 필터링, 없으면 전체 선택
    bookmarkedArticlesForInterest =
      !interestId || interestId.trim() === ''
        ? bookmark
        : (bookmarkedArticlesForInterest = bookmark.filter((data) => {
            return data.article.newsletter.interests.some(
              (interest) => interest.id === parseInt(interestId),
            );
          }));

    // 북마크 아티클 월별 그룹화
    const bookmarkedArticlesGroupedByMonth = {};

    for (const item of bookmarkedArticlesForInterest) {
      // 정렬 기준에 따라 년/월 분류 기준 날짜 결정
      const groupingDate = useBookmarkDateForGrouping
        ? new Date(item.createdAt) // 북마크 추가일 기준
        : new Date(item.article.date); // 아티클 수신일 기준

      const yearMonth = `${groupingDate.getFullYear()}-${String(
        groupingDate.getMonth() + 1,
      ).padStart(2, '0')}`;

      if (!bookmarkedArticlesGroupedByMonth[yearMonth]) {
        bookmarkedArticlesGroupedByMonth[yearMonth] = [];
      }
      bookmarkedArticlesGroupedByMonth[yearMonth].push({
        brandName: item.article.newsletter.brandName,
        brandId: item.article.newsletter.id,
        articleTitle: item.article.title,
        articleId: item.article.id,
        sampleText: item.article.firstTwoBody,
        date: item.article.date,
        imageURL: item.article.newsletter.imageUrl,
        bookmarkCreatedAt: item.createdAt, // 정렬용 북마크 추가 시점
        articleDate: item.article.date, // 정렬용 아티클 수신 시점
      });
    }

    // 각 월 내에서 정렬 기준 적용
    Object.keys(bookmarkedArticlesGroupedByMonth).forEach((yearMonth) => {
      const articles = bookmarkedArticlesGroupedByMonth[yearMonth];

      switch (sortBy_default) {
        case 'article_date_desc': // 최신 아티클순
          articles.sort(
            (a, b) =>
              new Date(b.articleDate).getTime() -
              new Date(a.articleDate).getTime(),
          );
          break;
        case 'article_date_asc': // 오래된 아티클순
          articles.sort(
            (a, b) =>
              new Date(a.articleDate).getTime() -
              new Date(b.articleDate).getTime(),
          );
          break;
        case 'bookmark_date': // 북마크 추가순 (기본값)
        default:
          articles.sort(
            (a, b) =>
              new Date(b.bookmarkCreatedAt).getTime() -
              new Date(a.bookmarkCreatedAt).getTime(),
          );
          break;
      }

      // 정렬용 필드 제거 (프론트에 불필요한 데이터 제거)
      articles.forEach((article) => {
        delete article.bookmarkCreatedAt;
        delete article.articleDate;
      });
    });

    // 월별 내림차순 정렬
    const bookmarkedArticlesGroupedByAndSorted = [];
    const sortedKeys = Object.keys(bookmarkedArticlesGroupedByMonth).sort(
      (a, b) => (a < b ? 1 : -1),
    );

    for (let i = 0; i < sortedKeys.length; i++) {
      const key = sortedKeys[i];
      const [year, month] = key.split('-');
      bookmarkedArticlesGroupedByAndSorted.push({
        id: i + 1,
        month: `${year}년 ${month}월`,
        bookmark: bookmarkedArticlesGroupedByMonth[key],
      });
    }

    return {
      data: {
        totalAmount: bookmarkedArticlesForInterest.length,
        bookmarkForMonth: bookmarkedArticlesGroupedByAndSorted,
      },
    };
  }

  async getUserReceivedArticleCount(userId: number) {
    const count = await this.prisma.article.count({
      where: {
        userId,
      },
    });

    return { count };
  }
}
