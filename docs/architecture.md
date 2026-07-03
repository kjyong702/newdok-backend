# Architecture

Newdok Backend는 뉴스레터 구독/추천 서비스의 API 서버입니다. 단순 CRUD보다
사용자별 구독 이메일 발급, 외부 메일 서버와 POP3 연동, 수신 메일 파싱, 소셜
로그인 전환, 운영 데이터 import를 핵심 책임으로 가집니다.

## System Context

```text
Mobile / Web Client
        |
        v
NestJS API Server
        |
        +-- MySQL / Railway
        +-- iwinv mail server via POP3S
        +-- Kakao OIDC JWKS
        +-- Apple OIDC JWKS
        +-- Twilio SMS
```

## Backend Responsibilities

- API 요청 검증과 Swagger 문서화
- JWT 기반 사용자 인증
- Kakao / Apple OIDC `idToken` 검증
- 신규 사용자 가입 시 구독 이메일 계정 할당
- POP3S 기반 이메일 수신과 아티클 저장
- 뉴스레터 브랜드, 산업군, 관심사, 발행 요일 관리
- 사용자별 구독 상태, 아티클, 북마크 관리
- Notion CSV 기반 신규 뉴스레터 import
- dev/prod DB 운영 절차 지원

## Module Map

| Module | Responsibility |
| --- | --- |
| `AuthModule` | SMS 인증, 소셜 로그인, 소셜 회원가입 |
| `UsersModule` | 사용자 정보 조회/수정, 탈퇴 |
| `NewslettersModule` | 뉴스레터 목록, 구독 신청/중지/재개 |
| `ArticlesModule` | 아티클 조회, 북마크, POP3 수집 실행 |
| `SearchModule` | 뉴스레터/아티클 검색 |
| `OptionsModule` | 산업군, 관심사, 요일 옵션 조회 |
| `SchedulerModule` | Cron 기반 POP3 자동 실행 |

## Layering

현재 구조는 NestJS의 Controller-Service-DTO-Prisma 패턴을 따릅니다.

```text
Controller
  -> DTO validation
  -> Service
     -> domain policy
     -> Prisma query / transaction
        -> MySQL
```

Repository 계층은 별도로 두지 않았습니다. 서비스 규모와 현재 팀 구조에서는
Service가 Prisma 호출을 조합하는 방식이 더 단순하고 변경 비용이 낮기 때문입니다.

## Core Domain Model

### User

서비스 사용자입니다. 소셜 로그인 전환 중이므로 기존 로컬 로그인 필드
`loginId`, `password`, `phoneNumber`는 nullable로 유지합니다.

주요 연결:

- `AuthAccount`: 소셜 로그인 식별 정보
- `MailboxPool`: 사용자에게 할당된 구독 이메일
- `UserConsent`: 회원가입 시점의 약관 동의 기록
- `NewslettersOnUsers`: 사용자별 뉴스레터 구독 상태
- `Article`: 사용자 구독 이메일로 수신한 아티클
- `Bookmark`: 사용자가 저장한 아티클

### AuthAccount

소셜 provider의 사용자 식별 정보를 저장합니다.

```text
unique(provider, providerUserId)
```

이메일은 provider에서 제공되지 않을 수 있고 변경될 수 있으므로 고유 식별자로
사용하지 않습니다.

### MailboxPool

사용자에게 할당할 구독 이메일 계정 풀입니다.

```text
AVAILABLE -> ASSIGNED -> RETIRED
```

한 번 사용자에게 할당된 이메일은 탈퇴 후에도 재사용하지 않습니다. 과거 수신
아티클, 외부 뉴스레터 구독 상태, 메일 서버 수신 이력과 충돌할 수 있기 때문입니다.

### Newsletter

뉴스레터 브랜드 데이터입니다. 산업군, 관심사, 발행 요일과 다대다 관계를 가지며,
POP3 수신 시 발신자 이메일(`brandEmail`, `secondEmail`, `thirdEmail`)로 매칭됩니다.

### Article

POP3로 수신한 이메일을 파싱해 저장한 아티클입니다. 사용자별 구독 이메일로
수신되므로 `userId`와 `newsletterId`를 함께 가집니다.

### UserConsent

회원가입 시점의 약관 동의 이력을 저장합니다. 현재는 필수 약관 중심이지만,
향후 선택 약관이 추가되어도 항목별 이력 관리가 가능하도록 별도 테이블로
분리했습니다.

## Main Flows

### Social Login And Signup

```text
Client SDK
  -> provider login
  -> idToken issued
  -> POST /auth/social-login
  -> backend verifies idToken with provider JWKS
  -> find AuthAccount by provider + providerUserId
     -> existing user: issue Newdok JWT
     -> new user: issue signupToken
  -> POST /auth/social-login/signup
  -> assign MailboxPool email
  -> create User, AuthAccount, UserConsent
  -> issue Newdok JWT
```

### Mailbox Assignment

```text
Signup request
  -> find oldest AVAILABLE MailboxPool
  -> create User
  -> connect User.mailboxPoolId
  -> set MailboxPool.status = ASSIGNED
```

### POP3 Article Collection

```text
Cron every minute
  -> ArticlesService.POP3()
  -> load non-deleted users
  -> connect to mail.newdok.store:995 via POP3S
  -> UIDL list
  -> retrieve newly assumed mail range
  -> parse email
  -> match Newsletter by sender email
  -> create Article
  -> update subscription state
```

## Operational Environments

dev와 prod는 DB와 서버를 분리해 운영합니다. 단, iwinv 메일 호스팅 서비스는 하나를
사용하고, 구독 이메일 번호대를 환경별로 분리해 충돌을 줄입니다.

```text
prod: lower mailbox number range
dev: higher mailbox number range
```

## Design Notes

- 소셜 로그인 사용자는 이메일이 아니라 `provider + providerUserId`로 식별합니다.
- Kakao와 Apple은 현재 독립 계정으로 가입될 수 있습니다.
- 계정 연결/병합은 자동으로 처리하지 않고 추후 별도 기능으로 설계합니다.
- 구독 이메일은 외부 뉴스레터 서비스와 연결되므로 재사용하지 않습니다.
- 뉴스레터 운영 데이터는 앱 배포 없이 CSV import로 추가할 수 있게 했습니다.

