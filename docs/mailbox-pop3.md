# Mailbox And POP3

Newdok은 사용자에게 뉴스레터 구독 전용 이메일 계정을 할당하고, 해당 메일함으로
수신된 뉴스레터를 POP3로 가져와 Article로 저장합니다. 이 구조는 사용자가 직접
뉴스레터를 구독하고도 앱 안에서 아티클을 모아볼 수 있게 하는 핵심 기능입니다.

## MailboxPool

`MailboxPool`은 미리 생성해 둔 구독 이메일 계정 풀입니다.

주요 필드:

| Field | Description |
| --- | --- |
| `email` | 실제 구독에 사용할 이메일 주소 |
| `password` | POP3 접속용 메일 계정 비밀번호 |
| `status` | `AVAILABLE`, `ASSIGNED`, `RETIRED` |
| `assignedAt` | 사용자에게 할당된 시각 |
| `user` | 연결된 User |

## Lifecycle

```text
AVAILABLE
  -> ASSIGNED
  -> RETIRED
```

### AVAILABLE

한 번도 사용자에게 할당되지 않은 메일 계정입니다. 신규 회원가입 시 이 상태의
계정만 할당 대상이 됩니다.

### ASSIGNED

현재 사용자에게 연결된 메일 계정입니다. 사용자는 이 이메일로 뉴스레터를 구독하고,
서버는 이 계정으로 POP3 수집을 수행합니다.

### RETIRED

과거 사용자에게 할당된 적이 있어 재사용하면 안 되는 계정입니다. 사용자가 탈퇴해도
외부 뉴스레터 서비스가 계속 메일을 보낼 수 있고, 과거 수신 이력과 충돌할 수
있으므로 다시 `AVAILABLE`로 되돌리지 않습니다.

## POP3 Scheduler

스케줄러는 1분마다 POP3 수집을 실행합니다.

```ts
@Cron('0 */1 * * * *')
```

수동 실행 API도 존재합니다.

```http
POST /articles/refresh
```

운영 중에는 POP3 수동 실행이 실제 메일 서버에 접근하고 DB에 Article을 저장할 수
있으므로 신중하게 사용해야 합니다.

## Collection Flow

```text
ArticlesService.POP3()
  -> skip if another POP3 job is running
  -> load users where deletedAt is null
  -> process users in batches
  -> connect to mail.newdok.store:995 with TLS
  -> UIDL list ([msgNumber, uidl] pairs)
  -> backfill legacy article uidls (one-time)
  -> for each mail not in (Article.uidl ∪ UnmatchedMail.uidl):
       -> RETR + parse email
       -> match newsletter via NewsletterSenderEmail
       -> matched: create Article (with uidl) + update subscription state
       -> unmatched: park into UnmatchedMail (PENDING)
  -> recover parked mails whose sender is now registered
  -> log cycle summary (saved / recovered / pending senders)
  -> QUIT POP3 connection
```

## Sender Matching

수신 메일은 발신자 이메일로 Newsletter를 찾습니다.

```text
NewsletterSenderEmail.email -> Newsletter
```

발신자 이메일은 `NewsletterSenderEmail` 테이블(뉴스레터당 개수 제한 없음)에서
단건 조회로 매칭합니다. 과거의 `brandEmail/secondEmail/thirdEmail` 3컬럼 구조는
전환기 동안 컬럼만 남아 있고 매칭에는 사용되지 않습니다.

## UIDL Cursor & Unmatched Parking

수집 진행 상태는 아티클 개수가 아니라 메일의 고유 ID(UIDL)로 판단합니다.

```text
이번에 처리할 메일 = 메일함 전체 UIDL
                  - (Article.uidl ∪ UnmatchedMail.uidl)
```

- 저장에 성공한 메일은 `Article.uidl`에, 발신자 미등록으로 보류된 메일은
  `UnmatchedMail`(주차장, status=PENDING)에 신원이 기록됩니다.
- 미등록 발신자를 만나도 수집은 중단되지 않고 해당 메일만 주차 후 계속
  진행됩니다. (과거의 "한 메일에서 영구 정지" 문제 해결)
- 매 사이클 주차장을 재점검해, 그 사이 등록된 발신자의 메일을 자동 회수합니다.
- 메일함에서 원본이 사라져 회수할 수 없게 된 주차 메일은 `UNRECOVERABLE`로
  표시됩니다.
- `(userId, uidl)` unique 제약으로 중복 저장이 DB 수준에서 차단됩니다.
- 레거시 아티클(uidl 없음)은 "id 오름차순 i번째 아티클 = 메일함 i번째 메일"
  불변식으로 서비스가 1회 자동 백필합니다. 불변식이 깨진 유저는 중복 방지를
  위해 수집을 건너뛰고 에러 로그를 남깁니다.

## Unmatched Sender Operations

미등록 발신자 운영 절차:

1. 확인: `pm2 logs`의 사이클 요약(`미등록 발신자 대기 N종: ...`) 또는
   `GET /articles/unmatched-senders` (master 전용, PENDING/UNRECOVERABLE 모두 반환)
2. 등록: DBeaver에서 `NewsletterSenderEmail`에 (newsletterId, email) row 추가
   또는 `POST /newsletters/:id/sender-emails` (master 전용)
3. 회수: 다음 수집 사이클(1분 내)에서 주차 메일이 자동으로 아티클로 저장됨

`UNRECOVERABLE` 메일을 재시도하려면 DBeaver에서 해당 `UnmatchedMail` row를
삭제합니다. 다음 사이클에 그 uidl이 미처리로 간주되어 재수집을 시도합니다.
(원본이 메일함에서 사라진 경우는 삭제해도 회수되지 않습니다.)

## Rollback Policy

신코드(UIDL 기반)가 1사이클이라도 돈 뒤에는 **구코드(count 기반)로 롤백하지
않습니다.** 주차로 생긴 '구멍' 때문에 구코드의 count 커서가 이미 저장된 메일을
다시 가리켜 중복 아티클이 생기고, 이후 신코드를 재배포하면 백필 위치 검증이
실패해 해당 유저 수집이 차단됩니다. 문제가 생기면 롤백 대신:

1. 수집만 급히 멈춰야 하면 `pm2 stop`으로 프로세스를 세우고
2. 원인을 수정해 앞으로 나아갑니다(fix-forward)

## Sender Registry Seed (3컬럼 → 명부 이관)

새 환경(또는 prod 최초 적용) 시 발신자 명부는 다음으로 적재합니다.

```bash
npm run seed:sender-emails:prod -- --apply \
  --extra "로하우=estherkong153-gmail.com@send.stibee.com" \
  --extra "로하우=lawyersjg-gmail.com@send.stibee.com"
```

- 대상 DB 자신의 3컬럼에서 placeholder(`@newdok.internal`) 제외 후 이관하므로
  dev/prod 간 newsletterId 불일치 문제가 없습니다.
- `--apply` 없이 실행하면 dry-run, 재실행해도 안전(멱등)합니다.
- `--extra`는 3칸 제한으로 등록하지 못했던 발신자를 함께 넣을 때 사용합니다.
- 순서: `db-push` (스키마) → seed (명부) → 신코드 배포.

## Subscription State Update

수신된 뉴스레터와 사용자 구독 관계에 따라 상태를 보정합니다.

| Condition | Behavior |
| --- | --- |
| 구독 관계 없음 | `doubleCheck` 여부에 따라 `CHECK` 또는 `CONFIRMED` 생성 |
| `CHECK` 상태 | 메일 수신 확인 후 `CONFIRMED`로 변경 |
| `PAUSED` 상태 | Article은 저장하되 `isVisible=false`로 숨김 |

뉴스레터 구독을 중지해도 외부 뉴스레터 메일이 실제로 중단되지 않을 수 있으므로,
Newdok은 수신 데이터를 유지하되 화면 노출 여부를 조절합니다.

## Deleted Users

탈퇴한 사용자는 POP3 수집 대상에서 제외합니다.

```text
where deletedAt is null
```

탈퇴 시에는 사용자 row 자체는 남기지만, 구독/아티클/북마크/관심사/AuthAccount/
UserConsent 등 연관 데이터는 삭제합니다. 연결된 MailboxPool은 `RETIRED`로
전환합니다.

## Master Account

서비스에는 전체 뉴스레터 아티클 미리보기 또는 지난 아티클 기능을 위해 master 또는
system 성격의 계정이 존재할 수 있습니다. 이 계정도 Article 구조상 User가 필요하므로
DB에는 User row로 유지합니다.

운영 정책:

- master 계정은 일반 사용자와 목적이 다릅니다.
- 삭제 대상에서 제외해야 합니다.
- POP3 수집 대상에는 포함될 수 있습니다.
- 해당 계정의 mailbox는 재사용하지 않습니다.

## Failure Handling

- RETR 실패(타임아웃 포함) 후에는 같은 연결의 명령-응답 짝이 어긋날 수 있어
  해당 유저의 이번 사이클 세션을 즉시 종료합니다(오저장 방지). 다음 사이클에
  같은 지점부터 재시도됩니다.
- 같은 메일이 3회 연속 실패하면 `UNRECOVERABLE`(발신자 `(수신 실패)`)로 주차해
  더 이상 사이클을 막지 않습니다.
- 과거의 count 기반 커서(`for i = savedArticleCount + 1 ...`)는 폐지되었습니다.
  메일 삭제로 순서가 밀려도 UIDL 기준이므로 안전합니다.

## Log Interpretation

```text
[POP3] 유저 email 메일 N개 / 처리됨 M개
```

N은 메일함 전체 UIDL 개수, M은 이미 신원이 기록된 메일 수
(`Article.uidl ∪ UnmatchedMail.uidl`)입니다. M에는 주차된 메일이 포함되므로
"저장된 아티클 수"와 다를 수 있습니다.

사이클 결과는 요약 로그로 판단합니다.

```text
[POP3] 유저 email 신규 저장 X건 / 회수 Y건 / 신규 주차 Z건
[POP3] 유저 email 미등록 발신자 대기 N종: sender(n통, "제목"), ...
```

`신규 저장 0건 / 회수 0건 / 신규 주차 0건`이면 이번 사이클에 새 메일이 없었던
것입니다. 미등록 발신자 요약 줄이 보이면 해당 발신자를 등록해 주세요(다음
사이클에 자동 회수).
