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
  -> UIDL list
  -> retrieve new mail range
  -> parse email
  -> match newsletter by sender email
  -> create Article
  -> update subscription state
  -> QUIT POP3 connection
```

## Sender Matching

수신 메일은 발신자 이메일로 Newsletter를 찾습니다.

```text
Newsletter.brandEmail
Newsletter.secondEmail
Newsletter.thirdEmail
```

새로운 뉴스레터 브랜드를 추가했지만 실제 발신자 이메일이 비어 있거나 틀리면 POP3
수집 중 `알 수 없는 뉴스레터 발신자` 오류가 발생할 수 있습니다. 운영 중에는
DBeaver 등으로 발신자 이메일을 보정합니다.

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

## Current Implementation Notes

현재 POP3 로직은 메일 서버의 UIDL 개수와 DB에 저장된 Article 개수를 비교해 새로
가져올 메일 범위를 계산합니다.

```text
for i = savedArticleCount + 1 to uidlList.length
```

이 방식은 메일 서버에서 과거 메일이 삭제되지 않고 순서가 유지된다는 가정이
있습니다. 추후 메일 서버 정책이 바뀌거나 일부 메일이 삭제될 수 있다면 UIDL을 DB에
별도로 저장해 중복/누락을 더 엄밀하게 제어하는 구조를 고려할 수 있습니다.

## Log Interpretation

```text
[POP3] 유저 email 메일 N개 / 저장된 아티클 M개
```

이 로그는 UIDL 목록 개수와 DB 저장 Article 개수를 비교한 것입니다. 실제 신규 저장은
다음 로그가 함께 있어야 판단할 수 있습니다.

```text
메일 수신 시작
아티클 저장 완료
```

해당 로그가 없다면 POP3 접속과 UIDL 조회만 수행되고 신규 Article 저장은 없었던
것으로 봅니다.
