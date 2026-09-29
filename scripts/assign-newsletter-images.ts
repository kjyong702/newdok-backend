// 뉴스레터 브랜드 이미지 배정 스크립트.
//
// CSV import로 들어온 뉴스레터는 imageUrl이 비어 있다(import 스크립트가 null로 생성).
// 이 스크립트는 public/ 에 놓인 이미지 파일을 브랜드명으로 찾아 imageUrl을 채운다.
//   - 파일명 규칙: `브랜드명.png` (경로에 못 쓰는 ':'는 '_'로. 예: 월간소묘: 레터 → 월간소묘_ 레터.png)
//   - 저장 형식: `<base-url>/public/<파일명>` (기존 108건과 같은 형식, 도메인은 환경별로 다름)
//   - 안전장치: 실제 이미지 파일(매직 바이트)인지 확인하고, 배포된 URL이 200으로
//     응답할 때만 DB에 쓴다. 즉 "배포 → 확인 → DB" 순서가 강제된다.
//
// 사용:
//   npx dotenv -e .development.env -- ts-node scripts/assign-newsletter-images.ts --base-url https://api-dev.newdok.store            (dry-run)
//   npx dotenv -e .development.env -- ts-node scripts/assign-newsletter-images.ts --base-url https://api-dev.newdok.store --apply
//   npx dotenv -e .production.env  -- ts-node scripts/assign-newsletter-images.ts --base-url https://api.newdok.store --apply        (prod: dev 검수 + 명시적 승인 후)
//
// 옵션:
//   --base-url URL   이미지가 서빙되는 API 도메인 (필수)
//   --apply          실제 갱신 (기본은 dry-run)
//   --overwrite      이미 imageUrl이 있는 뉴스레터도 파일이 있으면 덮어씀 (기본: 비어 있는 것만)
//   --brand 이름     특정 브랜드만 (여러 번 지정 가능)
//   --skip-http      배포 확인(HTTP) 생략. 로컬 검증만 할 때 사용. --apply와 함께 쓸 수 없음
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const SIZE_WARN_BYTES = 500 * 1024;

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
  const values = (flag: string) => {
    const found: string[] = [];
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] !== flag) {
        continue;
      }
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${flag} 값이 필요합니다.`);
      }
      found.push(value);
      i++;
    }
    return found;
  };

  const baseUrls = values('--base-url');
  if (baseUrls.length !== 1) {
    throw new Error(
      '--base-url 은 한 번 지정해야 합니다. 예: --base-url https://api-dev.newdok.store',
    );
  }
  const baseUrl = baseUrls[0].replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(baseUrl)) {
    throw new Error(
      '--base-url 은 경로 없는 도메인이어야 합니다. 예: https://api-dev.newdok.store',
    );
  }

  const apply = argv.includes('--apply');
  const skipHttp = argv.includes('--skip-http');
  if (apply && skipHttp) {
    throw new Error(
      '--apply 는 배포 확인 없이 실행할 수 없습니다 (--skip-http 제거).',
    );
  }

  return {
    baseUrl,
    apply,
    skipHttp,
    overwrite: argv.includes('--overwrite'),
    brands: values('--brand').map((value) => value.normalize('NFC')),
  };
}

// 브랜드명 → 허용되는 파일명 후보(확장자 제외). 콘텐츠 비교는 전부 NFC 기준.
function candidateStems(brandName: string) {
  const nfc = brandName.normalize('NFC').trim();
  return [...new Set([nfc, nfc.replace(/:/g, '_')])];
}

// 오타 탐지용 느슨한 비교 키: 공백·구두점·대소문자 무시
function looseKey(value: string) {
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/\.(png|jpe?g|webp)$/i, '')
    .replace(/[\s_:.\-!&,'"()]/g, '');
}

type FileInfo = {
  onDiskName: string; // 로컬 파일 시스템 이름(정규화 형태 그대로)
  name: string; // NFC 정규화 이름 (git/서버 기준, URL에 사용)
  bytes: number;
  kind: 'png' | 'jpeg' | 'webp' | 'unknown';
  width?: number;
  height?: number;
};

function inspectFile(onDiskName: string): FileInfo {
  const filePath = path.join(PUBLIC_DIR, onDiskName);
  const bytes = fs.statSync(filePath).size;
  const header = Buffer.alloc(32);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, header, 0, header.length, 0);
  } finally {
    fs.closeSync(fd);
  }

  const info: FileInfo = {
    onDiskName,
    name: onDiskName.normalize('NFC'),
    bytes,
    kind: 'unknown',
  };

  if (header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    info.kind = 'png';
    info.width = header.readUInt32BE(16);
    info.height = header.readUInt32BE(20);
  } else if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    info.kind = 'jpeg';
  } else if (
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    info.kind = 'webp';
  }

  return info;
}

function extensionMatchesKind(name: string, kind: FileInfo['kind']) {
  const ext = path.extname(name).toLowerCase();
  if (kind === 'png') return ext === '.png';
  if (kind === 'jpeg') return ext === '.jpg' || ext === '.jpeg';
  if (kind === 'webp') return ext === '.webp';
  return false;
}

function listNewFilesInGit(): Set<string> {
  try {
    const output = execSync(
      'git ls-files --others --exclude-standard -z -- public',
      {
        encoding: 'utf8',
      },
    );
    return new Set(
      output
        .split('\0')
        .filter(Boolean)
        .map((entry) => path.basename(entry).normalize('NFC')),
    );
  } catch {
    return new Set();
  }
}

async function checkDeployed(baseUrl: string, name: string) {
  const url = `${baseUrl}/public/${encodeURIComponent(name)}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    await response.arrayBuffer();
    const type = response.headers.get('content-type') ?? '';
    return {
      ok: response.status === 200 && type.startsWith('image/'),
      detail: `${response.status} ${type}`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: `요청 실패: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = buildPrismaClient();

  try {
    const newsletters = await prisma.newsletter.findMany({
      select: { id: true, brandName: true, imageUrl: true },
      orderBy: { id: 'asc' },
    });

    const onDiskNames = fs
      .readdirSync(PUBLIC_DIR)
      .filter(
        (name) =>
          !name.startsWith('.') &&
          EXTENSIONS.includes(path.extname(name).toLowerCase()),
      );
    // NFC 이름 → 파일 정보 (대소문자 무시 조회용 키도 함께)
    const filesByName = new Map<string, FileInfo>();
    const filesByLowerName = new Map<string, FileInfo>();
    for (const onDiskName of onDiskNames) {
      const info = inspectFile(onDiskName);
      filesByName.set(info.name, info);
      filesByLowerName.set(info.name.toLowerCase(), info);
    }

    const referencedNames = new Set<string>();
    for (const newsletter of newsletters) {
      if (!newsletter.imageUrl) continue;
      try {
        const pathname = decodeURIComponent(
          new URL(newsletter.imageUrl).pathname,
        );
        referencedNames.add(
          pathname.replace(/^\/public\//, '').normalize('NFC'),
        );
      } catch {
        // 형식이 깨진 URL은 참조로 치지 않는다
      }
    }

    const targets = newsletters.filter((newsletter) => {
      if (
        options.brands.length &&
        !options.brands.includes(newsletter.brandName.normalize('NFC'))
      ) {
        return false;
      }
      const hasImage = Boolean(
        newsletter.imageUrl && newsletter.imageUrl.trim(),
      );
      return options.overwrite || !hasImage;
    });

    console.log(
      `모드: ${
        options.apply ? 'APPLY(갱신)' : 'dry-run(변경 없음)'
      } / base-url ${options.baseUrl} / 대상 ${targets.length}건 (${
        options.overwrite ? '이미지 유무 무관' : '이미지 없는 뉴스레터'
      }${
        options.brands.length ? `, 브랜드 필터 ${options.brands.length}개` : ''
      })`,
    );

    type Plan = {
      id: number;
      brandName: string;
      file: FileInfo;
      imageUrl: string;
    };
    const plans: Plan[] = [];
    const missing: string[] = [];
    const invalid: string[] = [];
    const notDeployed: string[] = [];

    for (const newsletter of targets) {
      let file: FileInfo | undefined;
      for (const stem of candidateStems(newsletter.brandName)) {
        for (const ext of EXTENSIONS) {
          file =
            filesByName.get(`${stem}${ext}`) ??
            filesByLowerName.get(`${stem}${ext}`.toLowerCase());
          if (file) break;
        }
        if (file) break;
      }

      if (!file) {
        missing.push(newsletter.brandName);
        continue;
      }

      const problems: string[] = [];
      if (file.kind === 'unknown') {
        problems.push('이미지 파일이 아님(매직 바이트 불일치)');
      } else if (!extensionMatchesKind(file.name, file.kind)) {
        problems.push(`실제 형식은 ${file.kind}인데 확장자가 다름`);
      }
      if (file.bytes === 0) {
        problems.push('0바이트 파일');
      }
      if (problems.length) {
        invalid.push(
          `${newsletter.brandName} ← ${file.name}: ${problems.join(', ')}`,
        );
        console.log(
          `  ⛔ #${newsletter.id} ${newsletter.brandName} ← ${
            file.name
          } | ${problems.join(', ')}`,
        );
        continue;
      }

      const sizeNote = file.bytes > SIZE_WARN_BYTES ? ' ⚠️ 500KB 초과' : '';
      const dimNote = file.width ? ` ${file.width}x${file.height}` : '';
      const kb = Math.round(file.bytes / 1024);
      const imageUrl = `${options.baseUrl}/public/${file.name}`;

      if (!options.skipHttp) {
        const deployed = await checkDeployed(options.baseUrl, file.name);
        if (!deployed.ok) {
          notDeployed.push(
            `${newsletter.brandName} ← ${file.name} (${deployed.detail})`,
          );
          console.log(
            `  ⏳ #${newsletter.id} ${newsletter.brandName} ← ${file.name} [${file.kind}${dimNote} ${kb}KB${sizeNote}] | 서버 응답 ${deployed.detail} → 배포 후 다시 실행`,
          );
          continue;
        }
      }

      plans.push({
        id: newsletter.id,
        brandName: newsletter.brandName,
        file,
        imageUrl,
      });
      console.log(
        `  ✅ #${newsletter.id} ${newsletter.brandName} ← ${file.name} [${
          file.kind
        }${dimNote} ${kb}KB${sizeNote}]${
          options.skipHttp ? ' (배포 확인 생략)' : ' 배포 확인됨'
        }`,
      );
    }

    // 새로 추가됐지만 어떤 브랜드명과도 맞지 않는 파일 → 오타 가능성 안내.
    // 필터(--brand)나 이미지 유무와 무관하게 전체 뉴스레터 이름과 대조한다.
    const knownNames = new Set<string>();
    for (const newsletter of newsletters) {
      for (const stem of candidateStems(newsletter.brandName)) {
        for (const ext of EXTENSIONS) {
          knownNames.add(`${stem}${ext}`.toLowerCase());
        }
      }
    }
    const unmatchedNew = [...listNewFilesInGit()].filter(
      (name) =>
        !knownNames.has(name.toLowerCase()) && !referencedNames.has(name),
    );
    if (unmatchedNew.length) {
      const brandByLoose = new Map(
        newsletters.map((n) => [looseKey(n.brandName), n.brandName]),
      );
      console.log(
        `\n-- 새 파일이지만 브랜드명과 맞지 않는 것 ${unmatchedNew.length}건 (파일명 확인 필요) --`,
      );
      for (const name of unmatchedNew) {
        const guess = brandByLoose.get(looseKey(name));
        const suggested = guess
          ? `${guess.normalize('NFC').replace(/:/g, '_')}${path.extname(name)}`
          : null;
        console.log(
          `  ${name}${
            suggested
              ? `  → 혹시 "${guess}"? (정확한 파일명: ${suggested})`
              : ''
          }`,
        );
      }
    }

    console.log('\n===== 결과 =====');
    console.log(
      `배정 가능 ${plans.length}건 / 파일 없음 ${missing.length}건 / 파일 문제 ${invalid.length}건 / 배포 전 ${notDeployed.length}건`,
    );
    if (missing.length && missing.length <= 40) {
      console.log(`파일 없음: ${missing.join(', ')}`);
    }

    if (!options.apply) {
      console.log(
        'dry-run 완료: 실제 DB 변경 없음. 적용하려면 --apply 를 추가하세요.',
      );
      return;
    }

    let updated = 0;
    for (const plan of plans) {
      await prisma.newsletter.update({
        where: { id: plan.id },
        data: { imageUrl: plan.imageUrl },
      });
      updated++;
    }
    const remaining = await prisma.newsletter.count({
      where: { OR: [{ imageUrl: null }, { imageUrl: '' }] },
    });
    console.log(
      `갱신 완료 ${updated}건 / 아직 이미지 없는 뉴스레터 ${remaining}건`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
