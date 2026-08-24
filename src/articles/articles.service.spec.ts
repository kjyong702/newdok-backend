import { ArticlesService } from './articles.service';
import { UNMATCHED_MAIL_STATUS } from './constants/unmatched-mail-status';

// UIDL 기반 수집기의 핵심 안전장치(백필 불변식, 중복 방지, 주차/회수)를 검증한다.
describe('ArticlesService (UIDL 수집기)', () => {
  const createMockPrisma = () => ({
    article: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    unmatchedMail: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    newsletterSenderEmail: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    newslettersOnUsers: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    $executeRawUnsafe: jest.fn(),
  });

  const createService = (prisma: ReturnType<typeof createMockPrisma>) =>
    new ArticlesService(prisma as any);

  const rawEmail = (from: string, subject: string) =>
    `From: ${from}\r\nSubject: ${subject}\r\nDate: Mon, 24 Aug 2026 09:00:00 +0900\r\nContent-Type: text/plain\r\n\r\n본문입니다.`;

  describe('matchNewsletterBySender', () => {
    it('명부에 등록된 발신자면 뉴스레터를 반환한다', async () => {
      const prisma = createMockPrisma();
      const newsletter = { id: 7, brandName: '뉴닉', doubleCheck: false };
      prisma.newsletterSenderEmail.findUnique.mockResolvedValue({
        email: 'a@b.c',
        newsletter,
      });
      const service = createService(prisma);

      const result = await (service as any).matchNewsletterBySender(
        'a@b.c',
        'test',
      );

      expect(result).toEqual(newsletter);
      expect(prisma.newsletterSenderEmail.findUnique).toHaveBeenCalledWith({
        where: { email: 'a@b.c' },
        include: { newsletter: true },
      });
    });

    it('미등록 발신자면 null을 반환한다 (에러를 던지지 않는다)', async () => {
      const prisma = createMockPrisma();
      prisma.newsletterSenderEmail.findUnique.mockResolvedValue(null);
      const service = createService(prisma);

      await expect(
        (service as any).matchNewsletterBySender('unknown@x.y', 'test'),
      ).resolves.toBeNull();
    });
  });

  describe('ensureUidlBackfill', () => {
    const dummyPop3 = () => ({ RETR: jest.fn() });
    const articleDate = new Date('2026-08-24T00:00:00.000Z');

    it('백필 대상이 없으면 즉시 true', async () => {
      const prisma = createMockPrisma();
      prisma.article.count.mockResolvedValue(0);
      const service = createService(prisma);

      await expect(
        (service as any).ensureUidlBackfill(1, 'test', [['1', 'u1']], dummyPop3()),
      ).resolves.toBe(true);
      expect(prisma.article.findMany).not.toHaveBeenCalled();
    });

    it('아티클 수가 메일 수보다 많으면(불변식 붕괴) false로 수집을 차단한다', async () => {
      const prisma = createMockPrisma();
      prisma.article.count.mockResolvedValue(2);
      prisma.article.findMany.mockResolvedValue([
        { id: 1, uidl: null, title: 'A', date: articleDate },
        { id: 2, uidl: null, title: 'B', date: articleDate },
      ]);
      const service = createService(prisma);

      await expect(
        (service as any).ensureUidlBackfill(1, 'test', [['1', 'u1']], dummyPop3()),
      ).resolves.toBe(false);
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('기존 uidl과 위치가 어긋나면 false로 수집을 차단한다', async () => {
      const prisma = createMockPrisma();
      prisma.article.count.mockResolvedValue(1);
      prisma.article.findMany.mockResolvedValue([
        { id: 1, uidl: 'DIFFERENT', title: 'A', date: articleDate },
        { id: 2, uidl: null, title: 'B', date: articleDate },
      ]);
      const service = createService(prisma);

      await expect(
        (service as any).ensureUidlBackfill(
          1,
          'test',
          [
            ['1', 'u1'],
            ['2', 'u2'],
          ],
          dummyPop3(),
        ),
      ).resolves.toBe(false);
    });

    it('정상 백필: 표본 검증 통과 후 null인 아티클만 위치 기준으로 채운다', async () => {
      const prisma = createMockPrisma();
      prisma.article.count.mockResolvedValue(1);
      prisma.article.findMany.mockResolvedValue([
        { id: 10, uidl: 'u1', title: '첫 메일', date: articleDate },
        { id: 11, uidl: null, title: '둘째 메일', date: articleDate },
      ]);
      prisma.$executeRawUnsafe.mockResolvedValue(1);
      const service = createService(prisma);
      const pop3 = {
        RETR: jest.fn((n: number) =>
          Promise.resolve(
            rawEmail('a@b.c', n === 1 ? '첫 메일' : '둘째 메일'),
          ),
        ),
      };

      await expect(
        (service as any).ensureUidlBackfill(
          1,
          'test',
          [
            ['1', 'u1'],
            ['2', 'u2'],
            ['3', 'u3'],
          ],
          pop3,
        ),
      ).resolves.toBe(true);

      // 표본 검증: 첫(1)·마지막(2) 위치 메일을 내려받아 대조
      expect(pop3.RETR).toHaveBeenCalledWith(1);
      expect(pop3.RETR).toHaveBeenCalledWith(2);
      const sql = prisma.$executeRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain("WHEN 11 THEN 'u2'");
      expect(sql).toContain('WHERE id IN (11)');
      expect(sql).not.toContain('WHEN 10');
    });

    it('표본 검증 실패(제목·날짜 모두 불일치)면 백필을 차단한다', async () => {
      const prisma = createMockPrisma();
      prisma.article.count.mockResolvedValue(1);
      prisma.article.findMany.mockResolvedValue([
        {
          id: 10,
          uidl: null,
          title: '기존 아티클 제목',
          date: new Date('2020-01-01T00:00:00.000Z'), // 메일 날짜와도 불일치
        },
      ]);
      const service = createService(prisma);
      const pop3 = {
        RETR: jest
          .fn()
          .mockResolvedValue(rawEmail('a@b.c', '전혀 다른 메일 제목')),
      };

      await expect(
        (service as any).ensureUidlBackfill(1, 'test', [['1', 'u1']], pop3),
      ).resolves.toBe(false);
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe('saveArticleFromMail', () => {
    const newsletter = { id: 7, brandName: '뉴닉', doubleCheck: false };

    it('아티클을 uidl과 함께 저장하고 미구독이면 구독을 생성한다', async () => {
      const prisma = createMockPrisma();
      prisma.article.create.mockResolvedValue({ id: 100 });
      prisma.newslettersOnUsers.findUnique.mockResolvedValue(null);
      prisma.newslettersOnUsers.upsert.mockResolvedValue({});
      const service = createService(prisma);
      const parsed = await require('mailparser').simpleParser(
        rawEmail('a@b.c', '테스트 제목'),
      );

      await (service as any).saveArticleFromMail(
        1,
        'test',
        newsletter,
        parsed,
        'uid-1',
      );

      const createArg = prisma.article.create.mock.calls[0][0];
      expect(createArg.data.uidl).toBe('uid-1');
      expect(createArg.data.title).toBe('테스트 제목');
      expect(createArg.data.newsletterId).toBe(7);
      expect(prisma.newslettersOnUsers.upsert).toHaveBeenCalled();
    });

    it('(userId, uidl) 중복(P2002)이면 조용히 스킵한다 — 중복 저장 방지', async () => {
      const prisma = createMockPrisma();
      const { Prisma } = require('@prisma/client');
      const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.article.create.mockRejectedValue(p2002);
      const service = createService(prisma);
      const parsed = await require('mailparser').simpleParser(
        rawEmail('a@b.c', '중복 메일'),
      );

      await expect(
        (service as any).saveArticleFromMail(1, 'test', newsletter, parsed, 'dup'),
      ).resolves.toBeUndefined();
      expect(prisma.newslettersOnUsers.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('recoverParkedMails', () => {
    it('등록된 발신자의 주차 메일만 회수하고 주차장에서 삭제한다', async () => {
      const prisma = createMockPrisma();
      prisma.unmatchedMail.findMany.mockResolvedValue([
        { id: 1, uidl: 'u5', senderAddress: 'new@sender.com' },
        { id: 2, uidl: 'u6', senderAddress: 'still@unknown.com' },
      ]);
      prisma.newsletterSenderEmail.findMany.mockResolvedValue([
        {
          email: 'new@sender.com',
          newsletter: { id: 7, brandName: '뉴닉', doubleCheck: false },
        },
      ]);
      prisma.article.create.mockResolvedValue({ id: 200 });
      prisma.newslettersOnUsers.findUnique.mockResolvedValue({
        status: 'CONFIRMED',
      });
      prisma.unmatchedMail.delete.mockResolvedValue({});
      const service = createService(prisma);
      const pop3 = {
        RETR: jest.fn().mockResolvedValue(rawEmail('new@sender.com', '회수 메일')),
      };

      const recovered = await (service as any).recoverParkedMails(
        1,
        'test',
        pop3,
        [
          ['5', 'u5'],
          ['6', 'u6'],
        ],
      );

      expect(recovered).toBe(1);
      expect(pop3.RETR).toHaveBeenCalledWith(5);
      expect(prisma.unmatchedMail.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('원본 메일이 메일함에서 사라졌으면 UNRECOVERABLE로 표시한다', async () => {
      const prisma = createMockPrisma();
      prisma.unmatchedMail.findMany.mockResolvedValue([
        { id: 1, uidl: 'gone', senderAddress: 'new@sender.com' },
      ]);
      prisma.newsletterSenderEmail.findMany.mockResolvedValue([
        {
          email: 'new@sender.com',
          newsletter: { id: 7, brandName: '뉴닉', doubleCheck: false },
        },
      ]);
      prisma.unmatchedMail.update.mockResolvedValue({});
      const service = createService(prisma);

      const recovered = await (service as any).recoverParkedMails(
        1,
        'test',
        { RETR: jest.fn() },
        [['1', 'other-uidl']],
      );

      expect(recovered).toBe(0);
      expect(prisma.unmatchedMail.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: UNMATCHED_MAIL_STATUS.UNRECOVERABLE },
      });
    });

    it('회수 중 RETR 실패(세션 중단)면 주차 상태를 유지하고 루프를 멈춘다', async () => {
      const prisma = createMockPrisma();
      prisma.unmatchedMail.findMany.mockResolvedValue([
        { id: 1, uidl: 'u5', senderAddress: 'new@sender.com' },
      ]);
      prisma.newsletterSenderEmail.findMany.mockResolvedValue([
        {
          email: 'new@sender.com',
          newsletter: { id: 7, brandName: '뉴닉', doubleCheck: false },
        },
      ]);
      const service = createService(prisma);
      const pop3 = { RETR: jest.fn().mockRejectedValue(new Error('timeout')) };

      const recovered = await (service as any).recoverParkedMails(
        1,
        'test',
        pop3,
        [['5', 'u5']],
      );

      expect(recovered).toBe(0);
      expect(prisma.unmatchedMail.delete).not.toHaveBeenCalled();
      // 1회 실패는 상한 미달 → 상태 전환(upsert) 없이 다음 사이클 재시도
      expect(prisma.unmatchedMail.upsert).not.toHaveBeenCalled();
    });

    it('주차장이 비어 있으면 아무것도 하지 않는다', async () => {
      const prisma = createMockPrisma();
      prisma.unmatchedMail.findMany.mockResolvedValue([]);
      const service = createService(prisma);

      const recovered = await (service as any).recoverParkedMails(
        1,
        'test',
        { RETR: jest.fn() },
        [],
      );

      expect(recovered).toBe(0);
      expect(prisma.newsletterSenderEmail.findMany).not.toHaveBeenCalled();
    });
  });

  describe('실패 처리 안전장치', () => {
    it('fetchAndParseMail: RETR 실패는 세션 중단 에러(Pop3SessionAbortError)로 승격된다', async () => {
      const prisma = createMockPrisma();
      const service = createService(prisma);
      const pop3 = { RETR: jest.fn().mockRejectedValue(new Error('RETR 5 timeout')) };

      await expect(
        (service as any).fetchAndParseMail(pop3, '5', 'test'),
      ).rejects.toMatchObject({ name: 'Pop3SessionAbortError' });
    });

    it('recordMailFailure: 상한(3회) 전에는 주차하지 않고, 3회째에 회수 불가로 주차한다', async () => {
      const prisma = createMockPrisma();
      prisma.unmatchedMail.upsert.mockResolvedValue({});
      const service = createService(prisma);
      const err = new Error('fail');

      await expect(
        (service as any).recordMailFailure(1, 'test', 'u9', err),
      ).resolves.toBe(false);
      await expect(
        (service as any).recordMailFailure(1, 'test', 'u9', err),
      ).resolves.toBe(false);
      expect(prisma.unmatchedMail.upsert).not.toHaveBeenCalled();

      await expect(
        (service as any).recordMailFailure(1, 'test', 'u9', err),
      ).resolves.toBe(true);
      const upsertArg = prisma.unmatchedMail.upsert.mock.calls[0][0];
      expect(upsertArg.update.status).toBe(UNMATCHED_MAIL_STATUS.UNRECOVERABLE);
      expect(upsertArg.create.senderAddress).toBe('(수신 실패)');
    });

    it('백필 SQL은 작은따옴표와 백슬래시를 모두 이스케이프한다', async () => {
      const prisma = createMockPrisma();
      prisma.article.count.mockResolvedValue(1);
      prisma.article.findMany.mockResolvedValue([
        {
          id: 1,
          uidl: null,
          title: '제목X',
          date: new Date('2026-08-24T00:00:00.000Z'),
        },
      ]);
      prisma.$executeRawUnsafe.mockResolvedValue(1);
      const service = createService(prisma);
      const pop3 = {
        RETR: jest.fn().mockResolvedValue(rawEmail('a@b.c', '제목X')),
      };

      await (service as any).ensureUidlBackfill(
        1,
        'test',
        [['1', "a'b\\c"]],
        pop3,
      );

      const sql = prisma.$executeRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain("WHEN 1 THEN 'a''b\\\\c'");
    });
  });
});
