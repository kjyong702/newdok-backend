// NewsletterSenderEmail 명부 초기 적재(3컬럼 → 명부 이관) 스크립트.
//
// 대상 DB "자신의" Newsletter 3컬럼(brandEmail/secondEmail/thirdEmail)에서 실제
// 이메일만(placeholder `@newdok.internal` 제외) NewsletterSenderEmail로 이관한다.
// 각 환경이 자기 DB의 newsletterId를 사용하므로 dev/prod 간 id 불일치 문제가 없다.
// createMany + skipDuplicates라 재실행해도 안전(멱등)하다.
//
// 사용:
//   npm run seed:sender-emails:dev                  (dry-run)
//   npm run seed:sender-emails:dev -- --apply
//   npm run seed:sender-emails:prod -- --apply \
//     --extra "로하우=estherkong153-gmail.com@send.stibee.com" \
//     --extra "로하우=lawyersjg-gmail.com@send.stibee.com"
//
// --extra "브랜드명=email": 3컬럼에 없던 발신자를 함께 등록(예: 3칸 제한으로
// 등록하지 못했던 발신자). 브랜드명은 DB의 brandName과 정확히 일치해야 한다.
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

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
  const apply = argv.includes('--apply');
  const extras: { brandName: string; email: string }[] = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--extra') {
      continue;
    }
    const value = argv[i + 1];
    const sep = value ? value.indexOf('=') : -1;
    if (!value || sep <= 0) {
      throw new Error('--extra 형식이 올바르지 않습니다. 예: --extra "브랜드명=email"');
    }
    extras.push({
      brandName: value.slice(0, sep).trim(),
      email: value.slice(sep + 1).trim(),
    });
    i++;
  }

  return { apply, extras };
}

async function main() {
  const { apply, extras } = parseArgs(process.argv.slice(2));
  const prisma = buildPrismaClient();

  try {
    const newsletters = await prisma.newsletter.findMany({
      select: {
        id: true,
        brandName: true,
        brandEmail: true,
        secondEmail: true,
        thirdEmail: true,
      },
    });

    const rows: { newsletterId: number; email: string }[] = [];
    const seen = new Set<string>();
    let placeholderSkipped = 0;

    for (const newsletter of newsletters) {
      for (const email of [
        newsletter.brandEmail,
        newsletter.secondEmail,
        newsletter.thirdEmail,
      ]) {
        if (!email) {
          continue;
        }
        if (email.endsWith('@newdok.internal')) {
          placeholderSkipped++;
          continue;
        }
        const key = email.toLowerCase();
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        rows.push({ newsletterId: newsletter.id, email });
      }
    }

    for (const extra of extras) {
      const target = newsletters.find(
        (newsletter) => newsletter.brandName === extra.brandName,
      );
      if (!target) {
        throw new Error(`--extra 브랜드를 찾을 수 없습니다: ${extra.brandName}`);
      }
      const key = extra.email.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        rows.push({ newsletterId: target.id, email: extra.email });
      }
    }

    console.log(
      `대상 뉴스레터 ${newsletters.length}개 / 적재 후보 ${rows.length}건 (placeholder 제외 ${placeholderSkipped}건, extra ${extras.length}건)`,
    );

    if (!apply) {
      console.log('dry-run 완료: 실제 DB 변경 없음. 적용하려면 --apply를 추가하세요.');
      return;
    }

    const result = await prisma.newsletterSenderEmail.createMany({
      data: rows,
      skipDuplicates: true,
    });
    const total = await prisma.newsletterSenderEmail.count();
    console.log(`적재 완료: 신규 ${result.count}건 / 명부 총 ${total}건`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
