# Project Summary

이 문서는 Newdok Backend를 이력서, 포트폴리오, 면접에서 설명하기 위한 핵심 요약입니다.

## One-line Description

뉴스레터 구독 이메일 계정을 사용자에게 할당하고, POP3로 수신한 메일을 아티클로
저장해 추천/구독/북마크 경험을 제공하는 NestJS 기반 백엔드 API입니다.

## Why This Project Matters

Newdok Backend는 단순 CRUD 프로젝트가 아니라 외부 메일 서버, 소셜 provider, 운영
데이터, 스케줄러가 결합된 서비스형 백엔드입니다.

핵심 특징:

- 사용자별 구독 이메일 계정 풀 관리
- 외부 메일 서버와 POP3S 연동
- Cron 기반 주기적 메일 수집 자동화
- 수신 메일 파싱과 뉴스레터 브랜드 매칭
- Kakao / Apple OIDC 소셜 로그인 전환
- 운영자가 관리하는 뉴스레터 데이터를 CSV로 import
- dev/prod DB와 배포 절차 분리 운영
- GitHub Actions 기반 SSH/PM2 배포 자동화

## Technical Highlights

### 1. MailboxPool Design

사용자에게 뉴스레터 구독 전용 이메일 계정을 할당하기 위해 `MailboxPool`을
도입했습니다.

설계 포인트:

- 신규 가입 시 `AVAILABLE` 계정 할당
- 할당된 계정은 `ASSIGNED` 상태로 전환
- 탈퇴 또는 기존 데이터 정리 시 `RETIRED` 처리
- 한 번 사용된 이메일은 외부 구독 상태와 수신 이력 때문에 재사용하지 않음

면접 설명 포인트:

- 단순 user email이 아니라 외부 뉴스레터 구독과 연결된 리소스 풀로 모델링
- 데이터 재사용보다 수신 이력 무결성과 운영 안전성을 우선

### 2. POP3 Article Collection

메일 서버에 직접 POP3S로 접속해 사용자별 메일함을 조회하고, 새 메일을 Article로
저장합니다.

처리 흐름:

```text
Cron
  -> non-deleted users
  -> POP3 UIDL
  -> RETR new mail
  -> mailparser
  -> Newsletter sender matching
  -> Article create
  -> Subscription state update
```

구현 포인트:

- 중복 실행 방지 플래그
- POP3 명령, 파싱, DB 작업별 timeout
- 사용자 batch 병렬 처리
- 구독 중지 상태에서는 Article을 저장하되 `isVisible=false`
- 삭제 사용자는 수집 대상에서 제외

면접 설명 포인트:

- 외부 프로토콜 연동에서 timeout, 중복 실행, 부분 실패를 고려
- 스케줄러와 수동 실행 API를 모두 제공하되 운영 리스크를 문서화

### 3. Social Login Migration

기존 로컬 로그인에서 Kakao / Apple 소셜 로그인으로 전환 중입니다.

설계 포인트:

- OIDC `idToken` 기반 검증
- provider JWKS로 토큰 서명 검증
- 내부 식별자는 `provider + providerUserId`
- 이메일은 고유 식별자로 사용하지 않음
- 신규 소셜 계정은 `signupToken`으로 회원가입 단계 분리
- 약관 동의 이력을 `UserConsent`에 항목별 저장

면접 설명 포인트:

- OAuth/OIDC 흐름과 앱 SDK 기반 idToken 검증 차이를 학습하고 적용
- Kakao와 Apple의 provider 차이를 하나의 API로 추상화
- 계정 연결/병합은 자동 처리하지 않고 추후 정책으로 분리

### 4. Newsletter Data Operations

뉴스레터 브랜드 데이터는 기획자가 Notion에서 관리하고, 백엔드는 CSV import
스크립트로 신규 데이터를 반영합니다.

구현 포인트:

- dry-run과 `--apply` 분리
- 추가일자 필터로 신규 데이터만 import
- 산업군, 관심사, 요일 옵션 자동 연결
- `모든 산업`, 발행 요일 alias 등 운영 데이터 보정
- 실제 발신자 이메일이 없으면 placeholder 생성

면접 설명 포인트:

- 어드민이 없는 상황에서 반복 운영 작업을 스크립트로 자동화
- dev 검수 후 prod 반영하는 운영 절차 수립

### 5. Production Readiness

서비스 운영 중 발생한 요구사항을 반영해 안정성을 보강했습니다.

정리한 항목:

- 글로벌 예외 필터와 요청 검증 강화
- Swagger request/response 예시 보강
- env 파일과 secret 관리 기준 정리
- dev/prod DB push 절차 분리
- GitHub Actions 기반 CI/CD와 PM2 배포 스크립트 정리
- POP3 로그 해석 기준 정리
- AI agent 작업 지침과 프로젝트 문서화 시작

### 6. CI/CD Deployment Automation

기존에는 EC2/Lightsail 서버에 SSH로 접속해 `git pull`, `npm install`, `prisma
generate`, `build`, `pm2 restart`를 수동으로 실행했습니다. 이를 GitHub Actions와
SSH 기반 배포로 전환했습니다.

구현 포인트:

- PR 단계에서는 `npm ci`, `prisma generate`, `build` 검증만 수행
- `dev` 브랜치 push 시 dev 서버에 SSH 접속 후 PM2 배포 실행
- `main` 브랜치 push 시 prod 서버에 SSH 접속 후 PM2 배포 실행
- PM2 프로세스명은 `newdok-dev`, `newdok-prod`로 표준화
- 서버의 Node.js가 nvm 기반이라 비대화형 SSH 세션에서 `npm`을 찾지 못하는 문제를
  `~/.nvm/nvm.sh` 명시 로드로 해결

면접 설명 포인트:

- 수동 배포 절차를 CI/CD로 자동화해 반복 작업과 실수 가능성을 줄임
- PR 검증과 merge 후 배포 트리거를 분리해 배포 안정성을 확보
- interactive shell과 non-interactive shell의 환경 로딩 차이를 원인 분석해 해결

## Current Trade-offs

- Web 소셜 로그인 callback flow는 아직 구현하지 않았습니다.
- Apple authorization code 기반 token exchange/revoke 풀 플로우는 보류 상태입니다.
- Kakao와 Apple 계정은 현재 독립 계정으로 생성될 수 있습니다.
- POP3 신규 메일 판단은 현재 UIDL 개수와 저장 Article 수를 비교하는 방식입니다.
- 뉴스레터 운영 데이터는 아직 완전한 어드민이 아니라 CSV import 중심입니다.
- prod 자동 배포는 workflow 구성과 secret 등록은 완료했지만, 실제 prod 반영은 main
  merge 시점에 별도 확인이 필요합니다.

이 항목들은 미완성이라기보다 현재 서비스 단계에서 의도적으로 범위를 나눈
부분입니다. 추후 사용량과 운영 요구가 커지면 단계적으로 개선할 수 있습니다.

## Resume Keywords

- NestJS
- Prisma
- MySQL
- Railway
- JWT Authentication
- Kakao / Apple OIDC
- POP3S Mail Integration
- Cron Scheduler
- Mail Parsing
- Data Import Automation
- GitHub Actions CI/CD
- EC2 / PM2 Deployment
- Swagger API Documentation
- Production Data Operations
