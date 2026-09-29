// POP3 byte-stuffing 미복원으로 깨진 기존 아티클 본문 복구 스크립트.
//
// 배경: node-pop3는 RETR 응답의 byte-stuffing(RFC 1939 §3)을 되돌리지 않아 '.'으로
// 시작하던 줄이 '..'으로 저장됐다. quoted-printable 메일은 줄바꿈 위치의 점이 URL
// 한가운데 남아 이미지·링크가 깨지고(cdn..sanity.io), 8bit 메일은 CSS 선택자가
// 깨졌다(..wrap{}). 수집기는 수정됐고, 이 스크립트는 이미 저장된 본문을 복구한다.
//
// 방식: 본문에 '..'이 있는 아티클을 후보로, 메일함에서 uidl로 원본을 다시 받아
// 복원 후 재파싱한다. 새 본문이 "저장본에서 점만 제거한 결과"일 때만 갱신한다.
// 변화가 없거나(정상 말줄임표 등), 점 외의 차이가 있거나, 제목이 다르면 건너뛴다.
// RETR만 사용하고 DELE는 하지 않으므로 메일함은 변경되지 않는다. 재실행해도 안전하다.
//
// 사용:
//   npm run repair:dot-stuffing:dev                  (dry-run: DB 변경 없음)
//   npm run repair:dot-stuffing:dev -- --limit 20    (dry-run 일부만)
//   npm run repair:dot-stuffing:dev -- --apply       (기존 행 백업 후 갱신)
//   npm run repair:dot-stuffing:prod -- --apply      (prod: dev 검수 + 명시적 승인 후)
//
// 옵션:
//   --apply           실제 갱신. 갱신 직전 기존 행을 --backup-dir에 JSONL로 백업한다.
//   --limit N         후보 앞에서 N건만 처리
//   --user ID         특정 유저만
//   --ids 1,2,3       특정 아티클만
//   --backup-dir DIR  백업 위치 (기본: ~/newdok-backups)
//   --label NAME      로그·백업 파일명에 쓰는 환경 이름 (npm 스크립트가 지정)
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import { simpleParser } from 'mailparser';
import Pop3Command from 'node-pop3';
import * as os from 'os';
import * as path from 'path';
import {
  buildArticleContent,
  unstuffPop3Response,
} from '../src/articles/utils/mail-content.util';

const COMMAND_TIMEOUT_MS = 30_000;
const SAMPLE_LOG_LIMIT = 15;

function buildPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const url = new URL(databaseUrl);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    ssl: { rejectUnauthorized: false },
    acquireTimeout: 30_000,
    connectTimeout: 30_000,
  });

  return new PrismaClient({ adapter });
}

function parseArgs(argv: string[]) {
  const valueOf = (flag: string) => {
    const index = argv.indexOf(flag);
    if (index < 0) {
      return undefined;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} 값이 필요합니다.`);
    }
    return value;
  };

  const limitRaw = valueOf('--limit');
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error('--limit은 양의 정수여야 합니다.');
  }

  const userRaw = valueOf('--user');
  const userId = userRaw === undefined ? undefined : Number(userRaw);
  if (userId !== undefined && !Number.isInteger(userId)) {
    throw new Error('--user는 정수여야 합니다.');
  }

  const idsRaw = valueOf('--ids');
  const ids = idsRaw
    ?.split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  // 잘못된 --ids가 조용히 "전체 후보"로 바뀌지 않도록 막는다
  if (idsRaw !== undefined && (!ids || ids.length === 0)) {
    throw new Error('--ids 형식이 올바르지 않습니다. 예: --ids 101,102');
  }

  return {
    apply: argv.includes('--apply'),
    limit,
    userId,
    ids,
    backupDir:
      valueOf('--backup-dir') ?? path.join(os.homedir(), 'newdok-backups'),
    label: valueOf('--label') ?? 'unknown',
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label} timeout after ${ms}ms`)),
      ms,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// newBody가 oldBody에서 '.' 문자만 제거한 결과인지 검사한다.
// 복구가 "스터핑으로 끼어든 점 제거" 외에는 본문을 바꾸지 않음을 보장하는 안전장치.
function isDotOnlyRemoval(oldBody: string, newBody: string): boolean {
  if (newBody.length >= oldBody.length) {
    return false;
  }
  let j = 0;
  for (let i = 0; i < oldBody.length; i++) {
    if (j < newBody.length && oldBody[i] === newBody[j]) {
      j++;
    } else if (oldBody[i] !== '.') {
      return false;
    }
  }
  return j === newBody.length;
}

type Mailbox = { subscribeEmail: string; subscribePassword: string };

function openMailbox(mailbox: Mailbox) {
  return new Pop3Command({
    user: mailbox.subscribeEmail,
    password: mailbox.subscribePassword,
    host: 'mail.newdok.store',
    port: 995,
    tls: true,
  });
}

async function quietQuit(pop3: Pop3Command) {
  try {
    await withTimeout(pop3.QUIT(), 10_000, 'QUIT');
  } catch {
    // 종료 실패는 다음 연결에 영향이 없어 무시한다
  }
}

async function loadUidlMap(pop3: Pop3Command, label: string) {
  const list = (await withTimeout(
    pop3.UIDL(),
    COMMAND_TIMEOUT_MS,
    `${label} UIDL`,
  )) as string[][];
  return new Map(list.map(([msgNumber, uidl]) => [uidl, msgNumber]));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = buildPrismaClient();

  const stats = {
    candidates: 0,
    repairable: 0,
    dotsRemoved: 0,
    updated: 0,
    unchanged: 0,
    missingInMailbox: 0,
    titleMismatch: 0,
    unexpectedDiff: 0,
    failed: 0,
  };
  let backupFile: string | undefined;
  let sampleLogs = 0;

  try {
    const conditions = ["LOCATE('..', body) > 0", 'uidl IS NOT NULL'];
    const params: number[] = [];
    if (options.userId !== undefined) {
      conditions.push('userId = ?');
      params.push(options.userId);
    }
    if (options.ids) {
      conditions.push(`id IN (${options.ids.map(() => '?').join(', ')})`);
      params.push(...options.ids);
    }

    const rows = await prisma.$queryRawUnsafe<
      { id: number | bigint; userId: number | bigint; uidl: string }[]
    >(
      `SELECT id, userId, uidl FROM Article WHERE ${conditions.join(
        ' AND ',
      )} ORDER BY id ASC`,
      ...params,
    );
    const candidates = options.limit ? rows.slice(0, options.limit) : rows;
    stats.candidates = candidates.length;

    console.log(
      `[${options.label}] 모드: ${
        options.apply ? 'APPLY(갱신)' : 'dry-run(변경 없음)'
      } / 후보 ${candidates.length}건` +
        (rows.length > candidates.length
          ? ` (전체 ${rows.length}건 중 --limit 적용)`
          : ''),
    );

    if (options.apply && candidates.length > 0) {
      fs.mkdirSync(options.backupDir, { recursive: true, mode: 0o700 });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupFile = path.join(
        options.backupDir,
        `dot-stuffing-${options.label}-${stamp}.jsonl`,
      );
      console.log(`백업 파일: ${backupFile}`);
    }

    const byUser = new Map<number, { id: number; uidl: string }[]>();
    for (const row of candidates) {
      const userId = Number(row.userId);
      const list = byUser.get(userId) ?? [];
      list.push({ id: Number(row.id), uidl: row.uidl });
      byUser.set(userId, list);
    }

    for (const [userId, items] of byUser) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { subscribeEmail: true, subscribePassword: true },
      });
      if (!user?.subscribeEmail || !user.subscribePassword) {
        console.log(
          `유저 ${userId}: 메일함 정보 없음 → ${items.length}건 건너뜀`,
        );
        stats.failed += items.length;
        continue;
      }

      const mailbox: Mailbox = {
        subscribeEmail: user.subscribeEmail,
        subscribePassword: user.subscribePassword,
      };
      const label = mailbox.subscribeEmail;
      let pop3 = openMailbox(mailbox);
      let uidlToMsg: Map<string, string>;
      try {
        uidlToMsg = await loadUidlMap(pop3, label);
      } catch (error) {
        console.log(
          `유저 ${label}: UIDL 실패 → ${items.length}건 건너뜀 (${errorMessage(
            error,
          )})`,
        );
        stats.failed += items.length;
        await quietQuit(pop3);
        continue;
      }
      console.log(
        `유저 ${label}: 메일함 ${uidlToMsg.size}통 / 후보 ${items.length}건`,
      );

      try {
        for (const [index, item] of items.entries()) {
          if (index > 0 && index % 100 === 0) {
            console.log(
              `  진행 ${index}/${items.length} (복구 대상 누적 ${stats.repairable}건)`,
            );
          }

          const msgNumber = uidlToMsg.get(item.uidl);
          if (!msgNumber) {
            stats.missingInMailbox++;
            continue;
          }

          let raw: string;
          try {
            raw = (await withTimeout(
              pop3.RETR(Number(msgNumber)),
              COMMAND_TIMEOUT_MS,
              `${label} RETR ${msgNumber}`,
            )) as string;
          } catch (error) {
            // RETR 실패 후엔 연결의 명령-응답 짝을 신뢰할 수 없어 재연결한다
            stats.failed++;
            console.log(
              `  #${item.id} RETR 실패 → 재연결 (${errorMessage(error)})`,
            );
            await quietQuit(pop3);
            pop3 = openMailbox(mailbox);
            uidlToMsg = await loadUidlMap(pop3, label);
            continue;
          }

          try {
            const parsed = await withTimeout(
              simpleParser(unstuffPop3Response(raw)),
              COMMAND_TIMEOUT_MS,
              `${label} parse ${msgNumber}`,
            );
            const article = await prisma.article.findUnique({
              where: { id: item.id },
              select: {
                id: true,
                title: true,
                body: true,
                firstTwoBody: true,
                plainBody: true,
              },
            });
            if (!article) {
              stats.failed++;
              continue;
            }

            // 수집기와 같은 규칙으로 만든 제목이 다르면 다른 메일로 보고 건너뛴다
            const mailTitle = (parsed.subject || '제목 없음').slice(0, 191);
            if (mailTitle !== article.title) {
              stats.titleMismatch++;
              console.log(`  #${item.id} 제목 불일치 → 건너뜀`);
              continue;
            }

            const next = buildArticleContent(
              (parsed.html || parsed.text || '') as string,
            );
            if (next.body === article.body) {
              stats.unchanged++;
              continue;
            }
            if (!isDotOnlyRemoval(article.body, next.body)) {
              stats.unexpectedDiff++;
              console.log(`  #${item.id} 점 제거 외의 차이 발견 → 건너뜀`);
              continue;
            }

            const removed = article.body.length - next.body.length;
            stats.repairable++;
            stats.dotsRemoved += removed;
            if (sampleLogs < SAMPLE_LOG_LIMIT) {
              sampleLogs++;
              console.log(
                `  #${
                  item.id
                } 복구 대상: 끼어든 점 ${removed}개 | ${article.title.slice(
                  0,
                  50,
                )}`,
              );
            }

            if (options.apply && backupFile) {
              fs.appendFileSync(
                backupFile,
                `${JSON.stringify({ ...article, userId, uidl: item.uidl })}\n`,
                { mode: 0o600 },
              );
              await prisma.article.update({
                where: { id: item.id },
                data: {
                  body: next.body,
                  firstTwoBody: next.firstTwoBody,
                  plainBody: next.plainBody,
                },
              });
              stats.updated++;
            }
          } catch (error) {
            stats.failed++;
            console.log(`  #${item.id} 처리 실패 (${errorMessage(error)})`);
          }
        }
      } catch (error) {
        console.log(
          `유저 ${label}: 재연결 실패로 중단 (${errorMessage(error)})`,
        );
      } finally {
        await quietQuit(pop3);
      }
    }

    console.log('\n===== 결과 =====');
    console.log(`후보 ${stats.candidates}건`);
    console.log(
      `복구 대상(점만 제거) ${stats.repairable}건 / 제거될 점 ${stats.dotsRemoved}개`,
    );
    console.log(
      `변화 없음 ${stats.unchanged}건 / 메일함에 원본 없음 ${stats.missingInMailbox}건`,
    );
    console.log(
      `제목 불일치 ${stats.titleMismatch}건 / 점 외 차이 ${stats.unexpectedDiff}건 / 실패 ${stats.failed}건`,
    );
    if (options.apply) {
      console.log(
        `갱신 완료 ${stats.updated}건${
          backupFile ? ` (백업: ${backupFile})` : ''
        }`,
      );
    } else {
      console.log(
        'dry-run 완료: 실제 DB 변경 없음. 적용하려면 --apply를 추가하세요.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
