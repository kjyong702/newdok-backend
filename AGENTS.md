# Newdok Backend

> Codex는 이 파일을 프로젝트 지침의 단일 진입점으로 사용합니다.
> 작업 전 현재 git 상태와 관련 코드를 확인하고, 변경 성격에 맞는 검증과
> 커밋 안내를 제공합니다.

## 작업 규칙

- 작업 시작 전 `git status --short`로 워크트리 상태를 확인합니다.
- 커밋 메시지를 제안하기 전 `git diff --name-only`와 필요한 경우 최근 커밋
  맥락을 확인합니다.
- 사용자가 만들었거나 이미 존재하던 변경사항을 임의로 되돌리지 않습니다.
- `.env`, `.p8`, Notion CSV export, 운영 데이터 파일은 커밋하지 않습니다.
- DB 스키마 반영, prod DB 변경, 데이터 삭제, 운영 데이터 import는 명시적 확인
  없이 실행하지 않습니다.
- dev에서 먼저 검증하고, 문제가 없을 때 prod에 동일한 절차를 적용합니다.
- 불명확한 정책은 추측으로 구현하지 않고, 정책 선택지와 영향 범위를 먼저
  정리합니다.
- 단순 코드 변경이라도 빌드 또는 관련 테스트로 검증 가능한 경우 검증합니다.
- 커밋 메시지는 변경의 실제 성격을 기준으로 정합니다.
  - 새 기능: `feat`
  - 버그 또는 잘못된 구현 수정: `fix`
  - 문서/Swagger/설명 추가: `docs`
  - 동작 의도는 유지한 구조 정리: `refactor`

---

# Part 1: 프로젝트 설정

## 기본 정보

| 항목 | 값 |
| --- | --- |
| 프로젝트명 | newdok-backend |
| 서비스명 | 뉴독 |
| 설명 | 뉴스레터 구독 이메일 발급, POP3 아티클 수집, 뉴스레터 추천/구독을 제공하는 NestJS API |
| 기본 타임존 | `Asia/Seoul` |
| 주요 환경 | dev / prod 분리 |

## 핵심 도메인

- **User**: 뉴독 사용자. 소셜 로그인 전환 중이며 기존 로컬 로그인 필드는 당분간
  유지합니다.
- **AuthAccount**: 소셜 provider 계정 식별 정보. 사용자는 `provider +
  providerUserId` 기준으로 식별합니다.
- **MailboxPool**: 사용자에게 할당할 구독 이메일 계정 풀.
- **Newsletter**: 뉴스레터 브랜드 데이터.
- **Article**: POP3로 수신하고 파싱한 뉴스레터 아티클.
- **UserConsent**: 회원가입 시점의 약관 동의 기록.
- **Subscription**: 사용자와 뉴스레터 구독 관계.

## 현재 인증 정책

- 소셜 로그인 1차 연동은 OIDC `idToken` 기반입니다.
- 요청 형식은 다음을 기준으로 합니다.

```json
{
  "provider": "KAKAO",
  "platform": "IOS",
  "idToken": "string"
}
```

- 지원 provider는 현재 `KAKAO`, `APPLE`입니다.
- 카카오는 카카오 디벨로퍼스에서 OpenID Connect를 활성화해야 합니다.
- 카카오 `idToken` 검증의 `aud` 값은 `KAKAO_OIDC_AUDIENCE`를 우선 사용합니다.
- Apple iOS `idToken` 검증의 `aud` 값은 `APPLE_CLIENT_ID`를 사용합니다.
- Apple revoke/token exchange 풀 플로우는 현재 1차 연동 범위에서 제외합니다.
- 로컬 로그인, 기존 회원가입, SMS 인증 API는 소셜 로그인 완전 전환 전까지
  임시 유지합니다.
- 이메일은 소셜 계정의 고유 식별자로 사용하지 않습니다.
- 카카오와 애플은 현재 독립 계정으로 가입될 수 있습니다.
- 계정 연결은 추후 별도 기능으로 구현하며, 이미 각각 가입된 계정의 자동 병합은
  기본적으로 하지 않습니다.

## 현재 작업 범위

**진행 중**

- 앱 우선 소셜 로그인 전환.
- 카카오/애플 OIDC `idToken` 기반 로그인/회원가입.
- 앱 개발자 실제 연동 테스트 대기.

**보류**

- 기존 로컬 회원가입/로그인/SMS 인증 제거.
- Apple authorization code 기반 token exchange/revoke 풀 플로우.
- 소셜 계정 연결 또는 계정 병합.
- Web OAuth/OIDC callback flow.
- 뉴스레터 데이터 운영 어드민.

**현재 정책**

- 실사용 전환 전까지 기존 로컬 로그인 API는 유지합니다.
- 카카오와 애플은 provider별 독립 계정으로 생성될 수 있습니다.
- 계정 병합은 자동 처리하지 않습니다.

## MailboxPool 정책

- `AVAILABLE`은 한 번도 사용자에게 할당되지 않은 구독 이메일에만 사용합니다.
- 한 번 사용자에게 할당된 구독 이메일은 재사용하지 않습니다.
- 탈퇴하거나 기존 유저를 정리할 때 사용된 mailbox는 `RETIRED` 등 재사용 불가
  상태로 관리합니다.
- User와 MailboxPool 연결은 실제 구독 이메일 할당 상태를 나타냅니다.
- 테스트 유저를 정리할 때도 mailbox를 다시 `AVAILABLE`로 돌리지 않습니다.

## POP3 / 아티클 수집 정책

- POP3는 사용자 구독 이메일 계정 기준으로 메일을 조회합니다.
- 삭제된 사용자(`deletedAt` 존재)는 POP3 수집 대상에서 제외해야 합니다.
- master 또는 시스템 성격의 계정은 전체 뉴스레터 아티클 미리보기/지난 아티클
  수집을 위해 유지될 수 있습니다.
- POP3 로그의 `메일 N개 / 저장된 아티클 M개`는 UIDL 전체 개수와 DB 저장 개수
  비교입니다. `메일 수신 시작`, `아티클 저장 완료`가 없으면 신규 저장이 없던
  것으로 봅니다.

## 뉴스레터 데이터 운영 정책

- 신규 뉴스레터 데이터는 Notion CSV export를 기반으로 import 스크립트를
  사용합니다.
- CSV export 파일은 커밋하지 않습니다.
- dev DB에서 dry-run과 apply, 앱 검수를 먼저 수행합니다.
- dev 검수 후 같은 CSV를 prod DB에 적용합니다.
- 필요한 경우 DBeaver에서 `brandEmail`, `doubleCheck`, 이미지 URL 등을 보정할 수
  있습니다.

기본 절차:

```text
1. Notion에서 신규 추가분 CSV export
2. dev에서 import dry-run
3. dev에서 --apply
4. dev 앱에서 노출/필터/이미지 확인
5. 필요한 필드 보정
6. prod에서 같은 CSV로 --apply
7. prod 앱 확인
```

---

# Part 2: 기술 규칙

## 기술 스택

| 영역 | 선택 |
| --- | --- |
| Runtime | Node.js |
| Framework | NestJS + TypeScript |
| ORM | Prisma |
| DB | MySQL, Railway |
| API 문서 | Swagger |
| 입력 검증 | `class-validator`, `class-transformer`, 글로벌 `ValidationPipe` |
| 인증 토큰 | JWT |
| 소셜 토큰 검증 | OIDC idToken + `jose` JWKS 검증 |
| 테스트 | Jest |

## 주요 명령

| 목적 | 명령 |
| --- | --- |
| 개발 서버 | `npm run start` 또는 `npm run start:dev` |
| production 실행 | `npm run start:prod` |
| 빌드 | `npm run build` |
| dev PM2 배포 | `npm run deploy:dev` |
| prod PM2 배포 | `npm run deploy:prod` |
| dev DB push | `npm run db-push:dev` |
| prod DB push | `npm run db-push:prod` |
| dev DB pull | `npm run db-pull:dev` |
| prod DB pull | `npm run db-pull:prod` |
| dev 뉴스레터 import | `npm run import:newsletters:dev` |
| prod 뉴스레터 import | `npm run import:newsletters:prod` |

## 배포 체크포인트

- dev는 Lightsail에서 Nginx/Let's Encrypt와 PM2로 운영하며, NestJS는 `3001`
  포트를 사용합니다.
- production AWS 인프라는 현재 비용 절감을 위해 제거한 상태입니다.
- `ecosystem.config.js`의 PM2 프로세스명은 `newdok-dev`, `newdok-prod`입니다.
- GitHub Actions는 PR에서 CI build 검증을 수행하고, `dev` push 시 SSH 기반 PM2
  배포를 수행합니다.
- `main` push의 prod 배포는 `PROD_DEPLOY_ENABLED=true`일 때만 실행합니다.
- DB 스키마 변경이 없으면 `db push`를 실행하지 않습니다.
- dev 배포 전 `.development.env`에 필요한 env가 있는지 확인합니다.
- prod 배포 전 `.production.env`에 prod용 값이 들어있는지 확인합니다.
- 소셜 로그인 배포 시 특히 다음 값을 확인합니다.
  - dev Apple: `APPLE_CLIENT_ID=com.newdok.test`
  - prod Apple: `APPLE_CLIENT_ID=com.newdok.app`
  - Kakao: `KAKAO_OIDC_AUDIENCE`가 실제 idToken `aud`와 일치하는지
- 배포 후 Swagger UI는 최신 빌드와 서버 재시작이 반영되어야 합니다.

## 계층 규칙

| 계층 | 책임 |
| --- | --- |
| Controller | HTTP 요청, DTO 수신, Swagger 문서화 |
| Service | 비즈니스 규칙, Prisma 호출 조합 |
| DTO | API 입력 검증 |
| Prisma schema | 저장 구조와 DB 제약 |
| Constants | 도메인별 상태값과 정책값 |

- Repository 계층은 현재 사용하지 않습니다.
- 상태 문자열은 하드코딩하지 않고 도메인별 constants로 관리합니다.
- DB에 저장되는 상태 문자열은 그대로 두되, 코드에서는 상수/타입으로 참조합니다.

## API 규칙

- DTO는 `class-validator`로 검증합니다.
- Swagger에는 요청 body와 주요 응답 예시를 함께 문서화합니다.
- 소셜 로그인 응답은 기존 회원과 신규 회원 케이스를 구분해 문서화합니다.
- 에러는 NestJS 표준 HTTP 예외를 우선 사용합니다.
- 프론트 협업 중인 API는 요청/응답 예시를 실제 앱 플로우 기준으로 유지합니다.

## DB / 운영 규칙

- `prisma db push`는 명시적 승인 후 실행합니다.
- prod DB 작업은 dev에서 동일 작업 검증 후 진행합니다.
- 데이터 삭제/정리는 관련 테이블 영향을 먼저 SQL로 확인합니다.
- User hard delete는 신중하게 다루며, 현재 탈퇴는 관련 데이터 삭제 + User
  `deletedAt` 기록 + mailbox 재사용 방지 정책을 따릅니다.
- 기존 수동 정리 SQL은 운영 상황에 맞는 일회성 작업으로 보고, 코드 정책과
  혼동하지 않습니다.

## 환경변수 규칙

- `.development.env`, `.production.env`는 커밋하지 않습니다.
- secret 값은 채팅이나 문서에 원문으로 남기지 않습니다.
- Apple `.p8` 파일은 커밋하지 않습니다.
- 현재 앱 우선 소셜 로그인에는 다음 값이 중요합니다.
  - `KAKAO_OIDC_AUDIENCE`
  - `KAKAO_REST_API_KEY`
  - `APPLE_CLIENT_ID`
  - `DATABASE_URL`
  - `JWT_SECRET_KEY`
- Apple revoke/token exchange를 다시 도입할 때는 `APPLE_TEAM_ID`,
  `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_BASE64`가 필요할 수 있습니다.

## 검증 규칙

- 코드 변경 후 기본적으로 `npm run build`를 실행합니다.
- 인증/Auth 변경 시 관련 Jest 테스트를 실행합니다.

```text
npx jest src/auth/auth.controller.spec.ts src/auth/apple-auth.service.spec.ts --runInBand
```

- Prisma schema 변경 시 `npx prisma generate`를 실행합니다.
- Swagger 문서 변경은 빌드 통과와 실제 Swagger UI 표시 여부를 함께 확인합니다.

## 주의사항 / 트러블슈팅

### Swagger response 예시

- Swagger UI에서 response 예시가 보여야 하는 경우 `schema.examples`가 아니라
  `content['application/json'].examples` 위치를 우선 사용합니다.
- `@ApiOkResponse`, `@ApiBadRequestResponse`, `@ApiUnauthorizedResponse` 등 응답
  데코레이터를 실제 앱 연동 케이스 기준으로 작성합니다.
- Swagger 변경 후에는 빌드와 서버 재시작이 필요합니다.

### 소셜 로그인 OIDC

- `401 카카오 idToken이 유효하지 않습니다.`가 발생하면 가장 먼저
  `KAKAO_OIDC_AUDIENCE`와 실제 idToken `aud` 불일치를 확인합니다.
- `401 Apple identity token이 유효하지 않습니다.`가 발생하면 `APPLE_CLIENT_ID`와
  Apple idToken `aud` 불일치를 확인합니다.
- Kakao/Apple JWKS는 `jose`의 `createRemoteJWKSet`이 프로세스 메모리에 캐싱합니다.
  Redis 캐시는 현재 필요하지 않습니다.
- idToken 전체를 채팅이나 문서에 남기지 않습니다. 필요한 경우 payload의 `aud`
  같은 비밀이 아닌 claim만 확인합니다.

### POP3 스케줄러

- 로컬에서 `npm run start`를 실행하면 스케줄러가 같이 뜰 수 있습니다.
- POP3 실행이 우려되는 작업에서는 서버 기동을 최소화하고 로그를 확인합니다.
- `메일 N개 / 저장된 아티클 M개`만 있고 `메일 수신 시작`, `아티클 저장 완료`가
  없으면 신규 저장은 없던 것으로 봅니다.

### 운영 데이터 파일

- Notion CSV export는 import 후에도 커밋하지 않습니다.
- `AuthKey_*.p8` 파일은 로컬 보관만 허용하고 커밋하지 않습니다.
- env 값은 원문 공유하지 말고 키 존재 여부, 비어 있음 여부, 형식만 확인합니다.
