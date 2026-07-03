# Operations

이 문서는 Newdok Backend의 dev/prod 운영, DB 반영, 배포, 데이터 import 작업 시
확인해야 할 기준을 정리합니다.

## Branch Policy

일반 작업 흐름:

```text
feature/docs/chore branch
  -> dev
  -> main
```

권장 기준:

- 기능 개발: `feature/*`
- 문서 정리: `docs/*`
- 운영/설정 정리: `chore/*`
- 버그 수정: `fix/*`

작업 전후에는 항상 현재 브랜치와 워크트리 상태를 확인합니다.

```bash
git status --branch --short
```

## Environment Files

환경별 env 파일은 커밋하지 않습니다.

```text
.development.env
.production.env
```

비밀값 없는 예시는 `.env.example`에 관리합니다.

중요 환경변수:

| Key | Description |
| --- | --- |
| `DATABASE_URL` | Railway MySQL 접속 URL |
| `JWT_SECRET_KEY` | Newdok JWT 서명 키 |
| `KAKAO_REST_API_KEY` | Kakao 앱 REST API key |
| `KAKAO_OIDC_AUDIENCE` | Kakao idToken `aud` 검증값 |
| `APPLE_CLIENT_ID` | Apple iOS bundle id 검증값 |
| `APPLE_WEB_CLIENT_ID` | Apple Web client id, Web 연동 시 필요 |
| `TWILIO_*` | 기존 SMS 인증 유지 중 필요한 Twilio 설정 |

현재 `.env.example`은 앱 우선 `idToken` 로그인에 필요한 값만 포함합니다.

Apple token exchange/revoke 풀 플로우를 도입할 경우 다음 값이 추가로 필요합니다.

| Key | Description |
| --- | --- |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APPLE_KEY_ID` | Apple private key의 Key ID |
| `APPLE_PRIVATE_KEY_BASE64` | Apple `.p8` private key를 Base64로 인코딩한 값 |
| `PROVIDER_TOKEN_ENCRYPTION_KEY` | Provider refresh token 암복호화용 32바이트 Base64 키 |

## DB Schema Updates

Prisma schema 변경이 있을 때만 DB push를 실행합니다.

dev:

```bash
npm run db-push:dev
```

prod:

```bash
npm run db-push:prod
```

DB에서 현재 스키마를 Prisma schema로 introspect해야 하는 경우에는 다음 명령을
사용합니다. 운영 DB 기준 변경사항을 로컬 schema에 반영하는 작업이므로 실행 전
목적을 명확히 확인합니다.

```bash
npm run db-pull:dev
npm run db-pull:prod
```

주의사항:

- prod는 dev에서 먼저 검증한 후 진행합니다.
- data loss 경고가 뜨면 어떤 제약/컬럼 변경 때문인지 확인합니다.
- unique 제약 추가 전에는 중복 데이터가 없는지 SQL로 확인합니다.
- prod DB 변경은 DBeaver 등으로 사전 백업/상태 확인 후 진행합니다.

## Deployment Checklist

현재 배포 기준:

```text
dev  -> EC2/Lightsail instance + PM2 process: newdok-dev
prod -> EC2 instance behind ELB + PM2 process: newdok-prod
```

과거에는 prod 배포에 ECS/ECR을 사용했지만, 현재 운영 기준에서는 제거했습니다.
GitHub Actions는 PR에서 build 검증을 수행하고, `dev`/`main` push 시 SSH로 각
서버에 접속해 PM2 배포를 실행합니다.
Dockerfile은 추후 컨테이너 배포를 다시 도입할 수 있어 유지하되, 현재 배포 경로는
PM2입니다.

서버 전제조건:

- Node.js와 npm 설치
- PM2 전역 설치
- nvm을 사용하는 서버는 비대화형 SSH 세션에서도 `~/.nvm/nvm.sh`를 source해
  `node`, `npm`, `pm2`가 인식되어야 합니다.
- GitHub repository 접근 권한 설정
- `.development.env` 또는 `.production.env` 서버 로컬 배치, `PORT` 포함
- 최초 PM2 운영 시 `pm2 startup`, `pm2 save` 설정

GitHub Actions secrets:

| Secret | Description |
| --- | --- |
| `SSH_DEV_PRIVATE_KEY` | dev 서버 접속용 private key |
| `SSH_DEV_KNOWN_HOSTS` | dev 서버 known_hosts 값 |
| `SSH_DEV_USERNAME` | dev 서버 SSH 사용자 |
| `SSH_DEV_PUBLIC_IP` | dev 서버 public host 또는 IP |
| `SSH_PROD_PRIVATE_KEY` | prod 서버 접속용 private key |
| `SSH_PROD_KNOWN_HOSTS` | prod 서버 known_hosts 값 |
| `SSH_PROD_USERNAME` | prod 서버 SSH 사용자 |
| `SSH_PROD_PUBLIC_IP` | prod 서버 public host 또는 IP |

`SSH_*_KNOWN_HOSTS` 값은 로컬에서 다음 형식으로 확인해 GitHub Secrets에 등록합니다.

```bash
ssh-keyscan -H <server-host-or-ip>
```

GitHub Actions 트리거:

```text
pull_request -> build 검증만 수행
push to dev  -> build 검증 후 dev 서버 배포
push to main -> build 검증 후 prod 서버 배포
```

dev 배포 전:

- `npm run build` 통과
- `.development.env` 최신화
- dev DB schema 반영 여부 확인
- Swagger UI 최신 빌드 반영 확인
- POP3 scheduler 실행 여부 확인

dev 수동 배포:

```bash
ssh newdok-dev
cd ~/newdok-backend
git fetch origin dev
git checkout dev
git pull --ff-only origin dev
npm ci
npx prisma generate
npm run build
npm run deploy:dev
pm2 logs newdok-dev
```

prod 배포 전:

- dev 앱에서 동일 플로우 검증
- `.production.env` prod 값 확인
- prod DB schema 반영 필요 여부 확인
- 운영 데이터 import 또는 삭제 작업 여부 확인
- 배포 후 API/로그 확인

prod 수동 배포:

```bash
ssh newdok-prod
cd ~/newdok-backend
git fetch origin main
git checkout main
git pull --ff-only origin main
npm ci
npx prisma generate
npm run build
npm run deploy:prod
pm2 logs newdok-prod
```

프로세스 구성이 처음 등록되었거나 서버 재부팅 후 자동 복구 설정을 갱신해야 할 때는
배포 후 `pm2 save`를 실행합니다.

## Social Login Deployment Checks

Kakao:

- Kakao Developers에서 OIDC 활성화
- 앱에서 idToken을 전달하는지 확인
- `KAKAO_OIDC_AUDIENCE`와 idToken `aud` 일치 확인

Apple:

- iOS dev: `APPLE_CLIENT_ID=com.newdok.test`
- iOS prod: `APPLE_CLIENT_ID=com.newdok.app`
- Web 연동 시 `APPLE_WEB_CLIENT_ID` 별도 확인
- 현재 필수값은 idToken 검증용 client id이며, revoke 풀 플로우는 보류 상태

Swagger:

- `/auth/social-login`
- `/auth/social-login/signup`

두 API의 request/response 예시가 앱 개발자가 보는 Swagger UI에 표시되는지 확인합니다.

## Newsletter Import

Notion에서 신규 뉴스레터 데이터를 CSV로 export한 뒤 import 스크립트를 사용합니다.

dev dry-run:

```bash
npm run import:newsletters:dev -- --file "데이터분류.csv" --added-at "2026-05 3주,2026-05 4주"
```

dev apply:

```bash
npm run import:newsletters:dev -- --file "데이터분류.csv" --added-at "2026-05 3주,2026-05 4주" --apply
```

prod apply:

```bash
npm run import:newsletters:prod -- --file "데이터분류.csv" --added-at "2026-05 3주,2026-05 4주" --apply
```

운영 기준:

- CSV 파일은 커밋하지 않습니다.
- dev에서 dry-run 결과를 먼저 확인합니다.
- 앱에서 노출, 필터, 이미지, 구독 URL을 확인합니다.
- 실제 brandEmail을 모르면 placeholder가 들어가며, 이후 수신 메일 기준으로 보정합니다.
- `doubleCheck`, `temporaryMiss`, 이미지 URL은 DBeaver에서 보정할 수 있습니다.

## Manual Data Cleanup

사용자 데이터 정리 또는 뉴스레터 삭제 전에는 관련 테이블을 먼저 확인합니다.

사용자 탈퇴 정책:

- Bookmark 삭제
- NewslettersOnUsers 삭제
- InterestsOnUsers 삭제
- Article 삭제
- AuthAccount 삭제
- UserConsent 삭제
- MailboxPool은 `RETIRED`
- User는 `deletedAt` 기록

뉴스레터 삭제 정책:

- Article, Bookmark, Subscription 등 실제 사용 데이터가 있으면 삭제하지 않는 것을
  기본으로 합니다.
- 데이터가 없는 신규/오등록 뉴스레터만 관계 테이블 정리 후 삭제합니다.
- `_IndustryToNewsletter`, `_InterestToNewsletter`, `_DayToNewsletter` 등 Prisma
  implicit many-to-many 테이블은 실제 DB 컬럼명 `A`, `B`를 확인하고 작업합니다.

## POP3 Operations

자동 실행:

```text
Every minute
```

수동 실행:

```http
POST /articles/refresh
```

주의사항:

- POP3는 실제 메일 서버에 접속합니다.
- 신규 메일이 있으면 Article이 저장됩니다.
- 작업 중복 실행은 서비스 내부 플래그로 방지합니다.
- 삭제 사용자(`deletedAt` 존재)는 수집 대상에서 제외됩니다.

## Troubleshooting

### `Cannot GET /.env`

외부 스캐너가 서버의 환경변수 파일을 탐색하는 요청입니다. 실제 파일이 노출된 것이
아니라 404가 발생한 것이므로 보안 사고로 보지는 않습니다. 다만 로그 레벨과 예외
필터 정책을 조정해 노이즈를 줄일 수 있습니다.

### Swagger response example not visible

Swagger UI에서 response 예시가 보이지 않으면 `schema.examples`가 아니라
`content['application/json'].examples` 위치에 작성했는지 확인합니다.

### Kakao idToken invalid

- Kakao OIDC 활성화 여부 확인
- `KAKAO_OIDC_AUDIENCE` 확인
- 앱이 accessToken이 아니라 idToken을 보내는지 확인

### Apple identity token invalid

- `APPLE_CLIENT_ID`와 Apple token `aud` 확인
- Web 요청이면 `APPLE_WEB_CLIENT_ID` 확인
- 앱이 authorizationCode가 아니라 identityToken을 보내는지 확인
