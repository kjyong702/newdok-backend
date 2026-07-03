# Newdok Backend

<div align="center">

![Newdok logo](https://kr.object.ncloudstorage.com/newdok-bucket/%EB%89%B4%EB%8F%85%20%EB%A1%9C%EA%B3%A0%28300x100%29.png)

### 25-39 직장인을 위한 뉴스레터 큐레이팅 서비스

![Newdok preview](https://kr.object.ncloudstorage.com/newdok-bucket/%EB%89%B4%EB%8F%85%20%ED%94%84%EB%A6%AC%EB%B7%B0%282000x1000%29.png)

</div>

## Overview

Newdok은 사용자가 뉴스레터를 탐색하고, 추천받고, 구독 이메일을 통해 수신한
아티클을 한 곳에서 관리할 수 있게 하는 뉴스레터 큐레이션 서비스입니다.

이 저장소는 Newdok 서비스의 백엔드 API입니다. 사용자 인증, 소셜 로그인,
구독 이메일 계정 할당, 뉴스레터 브랜드 데이터 관리, POP3 기반 아티클 수집,
구독/북마크/검색 API를 담당합니다.

## Main Features

- 사용자 회원가입, 로그인, JWT 인증
- Kakao / Apple OIDC 기반 소셜 로그인
- 사용자별 뉴스레터 구독 이메일 계정 할당
- POP3 기반 뉴스레터 이메일 수신 및 Article 저장
- 뉴스레터 추천, 검색, 필터링
- 뉴스레터 구독 신청, 중지, 재개
- 아티클 읽음 상태 및 북마크 관리
- 약관 동의 이력 저장
- Swagger 기반 API 문서 제공

## Tech Stack

| Area | Stack |
| --- | --- |
| Runtime | Node.js |
| Framework | NestJS, TypeScript |
| ORM | Prisma |
| Database | MySQL, Railway |
| Auth | JWT, Kakao OIDC, Apple OIDC |
| Mail Sync | POP3, mailparser |
| API Docs | Swagger |
| Validation | class-validator, class-transformer |
| Test | Jest |

## Architecture

<div align="center">

<img width="80%" src="https://kr.object.ncloudstorage.com/newdok-bucket/%EC%84%9C%EB%B2%84%20%EC%95%84%ED%82%A4%ED%85%8D%EC%B2%98%28%EC%8B%A0%EB%B2%84%EC%A0%84%29.png" alt="Newdok server architecture" />

</div>

상세 문서:

- [Project Summary](docs/project-summary.md)
- [Architecture](docs/architecture.md)
- [Social Login](docs/auth-social-login.md)
- [Mailbox And POP3](docs/mailbox-pop3.md)
- [Operations](docs/operations.md)

### Core Domains

- `User`: 뉴독 사용자 정보와 구독 이메일 계정 연결을 관리합니다.
- `AuthAccount`: Kakao, Apple 등 소셜 provider의 계정 식별 정보를 저장합니다.
- `UserConsent`: 회원가입 시점의 약관 동의 이력을 저장합니다.
- `MailboxPool`: 사용자에게 할당 가능한 구독 이메일 계정 풀을 관리합니다.
- `Newsletter`: 뉴스레터 브랜드 정보와 산업군/관심사/요일 필터 정보를 관리합니다.
- `Article`: POP3로 수신한 뉴스레터 아티클을 저장합니다.
- `Subscription`: 사용자와 뉴스레터의 구독 관계를 관리합니다.
- `Bookmark`: 사용자의 아티클 북마크를 관리합니다.

## Authentication Flow

### Social Login

현재 앱 우선 연동 기준으로 Kakao와 Apple 로그인을 지원합니다.

```http
POST /auth/social-login
```

```json
{
  "provider": "KAKAO",
  "platform": "IOS",
  "idToken": "provider-id-token"
}
```

백엔드는 provider별 공개키(JWKS)로 `idToken`을 검증하고, 검증된
`provider + providerUserId` 조합으로 내부 계정을 조회합니다.

- 기존 가입자: Newdok JWT와 사용자 정보를 반환합니다.
- 신규 가입자: 회원가입용 `signupToken`을 반환합니다.

```http
POST /auth/social-login/signup
```

신규 가입자는 `signupToken`, 닉네임, 출생연도, 성별, 약관 동의 정보를 전달해
회원가입을 완료합니다.

### Local Auth

기존 이메일/비밀번호 기반 회원가입, 로그인, SMS 인증 API는 소셜 로그인 완전
전환 전까지 임시 유지합니다.

## Mailbox And POP3 Flow

Newdok은 사용자에게 뉴스레터 구독 전용 이메일 계정을 할당합니다. 사용자는 이
이메일로 뉴스레터를 구독하고, 서버는 POP3로 메일을 주기적으로 조회해 Article로
저장합니다.

```text
User signup
-> assign MailboxPool email
-> user subscribes to newsletters
-> POP3 scheduler fetches received emails
-> match newsletter sender
-> save Article
-> update subscription state if needed
```

MailboxPool 정책:

- `AVAILABLE`: 한 번도 할당되지 않은 이메일만 사용합니다.
- `ASSIGNED`: 현재 사용자에게 연결된 이메일입니다.
- `RETIRED`: 과거에 사용되어 재할당하면 안 되는 이메일입니다.

한 번 사용자에게 할당된 구독 이메일은 탈퇴 후에도 재사용하지 않습니다.

## Newsletter Data Operations

뉴스레터 브랜드 데이터는 운영자가 Notion에서 관리하고, CSV export를 통해
스크립트로 dev/prod DB에 반영합니다.

기본 절차:

```text
1. Notion에서 신규 뉴스레터 CSV export
2. dev DB에서 dry-run
3. dev DB에 apply
4. dev 앱에서 노출/필터/이미지 확인
5. 필요한 필드 보정
6. prod DB에 같은 CSV apply
7. prod 앱 확인
```

CSV export 파일은 운영 데이터이므로 커밋하지 않습니다.

## ERD

![Newdok ERD](https://kr.object.ncloudstorage.com/newdok-bucket/%EB%89%B4%EB%8F%85%20ERD%2824.09%20%EC%B5%9C%EC%8B%A0%29.png)

## Getting Started

### Prerequisites

- Node.js
- npm
- MySQL database
- PM2, 배포 서버에서 필요

### Install

```bash
npm install
```

### Environment Variables

환경별 env 파일은 로컬에서만 관리합니다.

- `.development.env`
- `.production.env`

비밀값 없는 예시는 [.env.example](.env.example)을 참고합니다.

주요 환경변수:

```text
PORT
DATABASE_URL
JWT_SECRET_KEY

KAKAO_REST_API_KEY
KAKAO_OIDC_AUDIENCE

APPLE_CLIENT_ID
APPLE_WEB_CLIENT_ID

TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_MESSAGING_SERVICE_SID
```

`.env`, Apple `.p8` key, 운영 CSV 파일은 커밋하지 않습니다.

### Prisma

```bash
npx prisma generate
npm run db-push:dev
```

prod DB 변경은 dev에서 검증한 뒤 실행합니다.

## Scripts

| Command | Description |
| --- | --- |
| `npm run start` | 개발 서버 실행, `start:dev` alias |
| `npm run start:dev` | 개발 서버 watch 모드 실행 |
| `npm run start:prod` | 빌드 산출물 production 모드 실행 |
| `npm run build` | NestJS 빌드 |
| `npm run deploy:dev` | PM2로 dev 프로세스 시작 또는 재시작 |
| `npm run deploy:prod` | PM2로 prod 프로세스 시작 또는 재시작 |
| `npm run db-push:dev` | dev DB 스키마 반영 |
| `npm run db-push:prod` | prod DB 스키마 반영 |
| `npm run db-pull:dev` | dev DB 스키마를 Prisma schema로 introspect |
| `npm run db-pull:prod` | prod DB 스키마를 Prisma schema로 introspect |
| `npm run db-studio:dev` | dev Prisma Studio 실행 |
| `npm run db-studio:prod` | prod Prisma Studio 실행 |
| `npm run import:newsletters:dev` | dev 뉴스레터 CSV import |
| `npm run import:newsletters:prod` | prod 뉴스레터 CSV import |

## Verification

```bash
npm run build
```

Auth 변경 시 관련 테스트를 실행합니다.

```bash
npx jest src/auth/auth.controller.spec.ts src/auth/apple-auth.service.spec.ts --runInBand
```

Swagger 문서는 서버 실행 후 `/api`에서 확인합니다.

## Operational Notes

- dev에서 먼저 검증하고 prod에 반영합니다.
- DB 스키마 변경이 없으면 `db push`를 실행하지 않습니다.
- prod DB 변경, 데이터 삭제, 대량 import는 사전 검증 후 진행합니다.
- 소셜 로그인에서 이메일은 고유 식별자로 사용하지 않습니다.
- 소셜 계정은 `provider + providerUserId` 기준으로 식별합니다.
- POP3 스케줄러는 삭제된 사용자(`deletedAt` 존재)를 수집 대상에서 제외해야 합니다.
- Swagger response 예시는 앱 연동 기준으로 유지합니다.
