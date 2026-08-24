import * as fs from 'fs';
import * as path from 'path';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

type CsvRow = Record<string, string>;
type Option = { id: number; name: string };

const ALL_INDUSTRIES = '모든 산업';

const INDUSTRY_ALIASES: Record<string, string> = {
  '패션・뷰티': '패션',
  건설: '건설・건축',
};

const WEEKDAY_ALIASES: Record<string, string> = {
  월: '월요일',
  화: '화요일',
  수: '수요일',
  목: '목요일',
  금: '금요일',
  토: '토요일',
  일: '일요일',
};

function getArgValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (quoted) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseRows(filePath: string): CsvRow[] {
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const [headers, ...rows] = parseCsv(content);

  return rows
    .filter((row) => row.some((value) => value.trim()))
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header.trim(), row[index]?.trim() ?? '']),
      ),
    );
}

function splitTags(value: string) {
  return value
    .split(',')
    .map((tag) => normalizeName(tag))
    .filter(Boolean);
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').replace(/·/g, '・');
}

function isYes(value: string) {
  return normalizeName(value).toLowerCase() === 'yes';
}

function getUniqueBrandNames(rows: CsvRow[]) {
  const seen = new Set<string>();
  const duplicated = new Set<string>();

  for (const row of rows) {
    const brandName = row['뉴스레터 이름'];
    if (seen.has(brandName)) {
      duplicated.add(brandName);
    }
    seen.add(brandName);
  }

  return duplicated;
}

function resolveOptions(
  rawTags: string[],
  options: Option[],
  optionType: string,
  aliases: Record<string, string> = {},
) {
  const byName = new Map(options.map((option) => [option.name, option]));
  const result: Option[] = [];
  const missing: string[] = [];

  for (const rawTag of rawTags) {
    const tag = aliases[rawTag] ?? rawTag;
    const option = byName.get(tag);

    if (!option) {
      missing.push(rawTag);
      continue;
    }

    if (!result.some((item) => item.id === option.id)) {
      result.push(option);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `${optionType} 매칭 실패: ${[...new Set(missing)].join(', ')}`,
    );
  }

  return result;
}

function extractWeekdayNames(publicationCycle: string) {
  const normalized = normalizeName(publicationCycle);
  const weekdays = new Set<string>();

  if (!normalized) {
    return [];
  }

  if (normalized.includes('평일')) {
    ['월', '화', '수', '목', '금'].forEach((day) => weekdays.add(day));
  }

  if (normalized.includes('월~목')) {
    ['월', '화', '수', '목'].forEach((day) => weekdays.add(day));
  }

  for (const day of Object.keys(WEEKDAY_ALIASES)) {
    const standaloneDay = new RegExp(`(^|[\\s,/~\\-])${day}($|[\\s,/~\\-])`);
    if (normalized.includes(`${day}요일`) || standaloneDay.test(normalized)) {
      weekdays.add(day);
    }
  }

  return [...weekdays].map((day) => WEEKDAY_ALIASES[day]);
}

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

async function main() {
  const fileArg = getArgValue('--file');
  if (!fileArg) {
    throw new Error(
      'CSV 파일 경로가 필요합니다. 예: npm run import:newsletters:dev -- --file "데이터분류.csv"',
    );
  }

  const filePath = path.resolve(fileArg);
  const apply = hasArg('--apply');
  const addedAtArg = getArgValue('--added-at');
  const addedAtFilter = addedAtArg
    ? new Set(addedAtArg.split(',').map((value) => normalizeName(value)))
    : undefined;

  const rows = parseRows(filePath).filter((row) => {
    if (isYes(row['삭제'])) {
      return false;
    }

    return addedAtFilter
      ? addedAtFilter.has(normalizeName(row['추가일자']))
      : true;
  });

  const duplicatedBrandNames = getUniqueBrandNames(rows);
  if (duplicatedBrandNames.size > 0) {
    throw new Error(
      `CSV 내부 뉴스레터 이름 중복: ${[...duplicatedBrandNames].join(', ')}`,
    );
  }

  const prisma = buildPrismaClient();

  try {
    const [industries, interests, days, existingNewsletters, existingSenders] =
      await Promise.all([
        prisma.industry.findMany({ orderBy: { id: 'asc' } }),
        prisma.interest.findMany({ orderBy: { id: 'asc' } }),
        prisma.day.findMany({ orderBy: { id: 'asc' } }),
        prisma.newsletter.findMany({
          select: {
            brandName: true,
          },
        }),
        prisma.newsletterSenderEmail.findMany({ select: { email: true } }),
      ]);

    const existingBrandNames = new Set(
      existingNewsletters.map((newsletter) => newsletter.brandName),
    );
    const existingEmails = new Set(
      existingSenders.map((sender) => sender.email),
    );

    const createInputs = rows
      .filter((row) => !existingBrandNames.has(row['뉴스레터 이름']))
      .map((row) => {
        const brandName = row['뉴스레터 이름'];
        const industryTags = splitTags(row['산업군']);
        const resolvedIndustries = industryTags.includes(ALL_INDUSTRIES)
          ? industries
          : resolveOptions(industryTags, industries, '산업군', INDUSTRY_ALIASES);
        const resolvedInterests = resolveOptions(
          splitTags(row['관심사']),
          interests,
          '관심사',
        );
        const extractedDayNames = extractWeekdayNames(row['발행일시']);
        const resolvedDays = resolveOptions(
          extractedDayNames,
          days,
          '발행요일',
        );
        // 실제 발신자 이메일이 있을 때만 NewsletterSenderEmail로 등록한다.
        // 없으면 비워두고, 수신 후 운영에서 row를 추가한다(placeholder 폐지).
        const senderEmails = row['뉴스레터 이메일']
          ? [row['뉴스레터 이메일'].trim()]
          : [];

        for (const email of senderEmails) {
          if (existingEmails.has(email)) {
            throw new Error(`${brandName} 이메일 중복: ${email}`);
          }
          existingEmails.add(email);
        }

        return {
          brandName,
          data: {
            brandName,
            firstDescription: row['뉴스레터 간략 소개 - 최적 (40자)'] || null,
            secondDescription: row['뉴스레터 간략 소개 - 차선 (25자)'] || null,
            detailDescription: row['뉴스레터 상세 소개 (130자)'] || null,
            publicationCycle: row['발행일시'] || null,
            subscribeUrl: row['구독신청 URL'] || null,
            previewUrl: null,
            imageUrl: null,
            senderEmails: senderEmails.length
              ? { create: senderEmails.map((email) => ({ email })) }
              : undefined,
            doubleCheck: isYes(row['구독확인']),
            temporaryMiss: isYes(row['휴재']) || isYes(row['숨김']),
            industries: {
              connect: resolvedIndustries.map((industry) => ({ id: industry.id })),
            },
            interests: {
              connect: resolvedInterests.map((interest) => ({ id: interest.id })),
            },
            days: {
              connect: resolvedDays.map((day) => ({ id: day.id })),
            },
          },
          summary: {
            addedAt: row['추가일자'],
            industries: resolvedIndustries.map((industry) => industry.name),
            interests: resolvedInterests.map((interest) => interest.name),
            days: resolvedDays.map((day) => day.name),
            senderEmails,
          },
        };
      });

    console.log(`CSV rows: ${rows.length}`);
    console.log(`Existing skipped: ${rows.length - createInputs.length}`);
    console.log(`${apply ? 'Create' : 'Dry-run create'}: ${createInputs.length}`);

    for (const item of createInputs) {
      console.log(
        [
          item.brandName,
          `추가일자=${item.summary.addedAt}`,
          `산업군=${item.summary.industries.join('/')}`,
          `관심사=${item.summary.interests.join('/')}`,
          `요일=${item.summary.days.join('/') || '없음'}`,
          `이메일=${item.summary.senderEmails.join('/') || '없음(수신 후 등록)'}`,
        ].join(' | '),
      );
    }

    if (!apply) {
      console.log('dry-run 완료: 실제 DB 변경 없음. 적용하려면 --apply를 추가하세요.');
      return;
    }

    for (const item of createInputs) {
      await prisma.newsletter.create({ data: item.data });
    }

    console.log(`import 완료: ${createInputs.length}개 생성`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
