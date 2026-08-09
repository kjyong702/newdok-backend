# Social Login

Newdok은 기존 로컬 로그인에서 Kakao / Apple 소셜 로그인 중심 구조로 전환 중입니다.
현재 앱 우선 연동 단계이며, 로컬 로그인과 SMS 인증 API는 완전 전환 전까지
임시 유지합니다.

## Current Policy

- 지원 provider: `KAKAO`, `APPLE`
- 인증 방식: OIDC `idToken` 검증
- 내부 사용자 식별 기준: `provider + providerUserId`
- 이메일은 고유 식별자로 사용하지 않음
- Kakao 계정과 Apple 계정은 현재 서로 독립된 Newdok 계정으로 가입 가능
- 계정 연결/병합은 추후 별도 정책 확정 후 구현

## Login Start API

```http
POST /auth/social-login
```

Request:

```json
{
  "provider": "KAKAO",
  "platform": "IOS",
  "idToken": "provider-id-token"
}
```

### Fields

| Field | Description |
| --- | --- |
| `provider` | `KAKAO` 또는 `APPLE` |
| `platform` | `IOS`, `ANDROID`, `WEB` |
| `idToken` | Provider SDK에서 발급받은 OIDC identity token |
| `authorizationCode` | (선택) Apple 로그인 시 SDK에서 발급받은 authorization code |

현재 Apple 로그인은 `IOS`, `WEB`만 지원합니다. `ANDROID`로 Apple 로그인을 요청하면
400 응답을 반환합니다.

Apple 로그인에서 `authorizationCode`를 함께 보내면 서버가 Apple 토큰 엔드포인트와
교환해 refresh token을 암호화 저장합니다. 이 값은 탈퇴 시 Apple 로그인 연결
해제(revoke)에 사용됩니다. authorization code는 발급 후 5분 내 1회만 사용할 수
있으므로 로그인 요청 시점에 바로 전달해야 하며, 기존 가입자의 로그인에서도 보내면
저장값이 갱신됩니다. 교환에 실패해도 로그인/회원가입 자체는 실패하지 않습니다
(서버 로그로 확인).

## Registered User Response

이미 가입된 소셜 계정이면 Newdok JWT를 반환합니다.

```json
{
  "isRegistered": true,
  "accessToken": "newdok-access-token",
  "user": {
    "id": 1,
    "loginId": null,
    "phoneNumber": null,
    "subscribeEmail": "newdok101@newdok.store",
    "nickname": "뉴독이용자",
    "birthYear": "1997",
    "gender": "남자",
    "createdAt": "2026-06-29T00:00:00.000Z",
    "industryId": null,
    "interests": []
  }
}
```

## New User Response

가입되지 않은 소셜 계정이면 회원가입을 완료하기 위한 임시 토큰을 반환합니다.

```json
{
  "isRegistered": false,
  "signupToken": "temporary-social-signup-token",
  "profile": {
    "provider": "KAKAO",
    "providerUserId": "123456789",
    "email": null,
    "nickname": "카카오닉네임"
  }
}
```

`signupToken`은 Newdok 서버가 발급한 임시 JWT입니다. provider 식별 정보와
회원가입 토큰 유형을 담고 있으며, 실제 회원가입 완료 API에서 다시 검증됩니다.

## Signup Complete API

```http
POST /auth/social-login/signup
```

Request:

```json
{
  "signupToken": "temporary-social-signup-token",
  "nickname": "뉴독이용자",
  "birthYear": "1997",
  "gender": "남자",
  "agreements": [
    {
      "type": "AGE_CONFIRMATION_OVER_14",
      "agreed": true
    },
    {
      "type": "TERMS_OF_SERVICE",
      "agreed": true
    },
    {
      "type": "PERSONAL_INFORMATION_COLLECTION_AND_USE",
      "agreed": true
    },
    {
      "type": "MARKETING_INFORMATION_RECEIPT",
      "agreed": false
    }
  ]
}
```

서버는 `agreements`의 항목을 현재 약관 정책과 비교해 필수 약관 동의 여부를
검증하고, UserConsent에 항목별 이력을 저장합니다. 마케팅 정보 수신 동의는 선택
항목이므로 `agreed: false`여도 회원가입할 수 있습니다.

## Kakao OIDC

Kakao 로그인은 Kakao Developers에서 OpenID Connect를 활성화해야 합니다.

검증 기준:

- JWKS: `https://kauth.kakao.com/.well-known/jwks.json`
- issuer: `https://kauth.kakao.com`
- audience: `KAKAO_OIDC_AUDIENCE`

`KAKAO_OIDC_AUDIENCE`가 없으면 기존 호환을 위해 `KAKAO_NATIVE_APP_KEY`,
`KAKAO_REST_API_KEY` 순서로 fallback합니다. 운영에서는 실제 idToken의 `aud`와
일치하는 값을 명시적으로 설정하는 것을 권장합니다.

## Apple OIDC

Apple 로그인은 Apple identity token을 검증합니다.

검증 기준:

- JWKS: `https://appleid.apple.com/auth/keys`
- issuer: `https://appleid.apple.com`
- iOS audience: `APPLE_CLIENT_ID`
- Web audience: `APPLE_WEB_CLIENT_ID`

로그인/회원가입 필수 검증은 Apple `idToken`입니다. `authorizationCode`가 함께
전달되면 token exchange를 수행해 refresh token을 확보하고, 탈퇴 시 revoke에
사용합니다.

token exchange/revoke에는 다음 값이 추가로 필요합니다.

- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY_BASE64` 또는 `APPLE_PRIVATE_KEY_PATH`
- `PROVIDER_TOKEN_ENCRYPTION_KEY` (32바이트 Base64, refresh token 암호화 키)

## Withdrawal (탈퇴)

```http
PATCH /users/withdraw
Authorization: Bearer {accessToken}
```

탈퇴는 다음을 함께 수행합니다.

1. Provider 연결 해제
   - Kakao: Admin Key(`KAKAO_ADMIN_KEY`)와 저장된 `providerUserId`(회원번호)로
     `POST https://kapi.kakao.com/v1/user/unlink` 호출. 앱에서 보낼 추가
     파라미터는 없습니다.
   - Apple: 저장된 refresh token을 복호화해
     `POST https://appleid.apple.com/auth/revoke` 호출. 저장된 refresh token이
     없으면(구버전 앱에서 `authorizationCode` 없이 가입한 경우) revoke 없이
     탈퇴만 진행됩니다.
2. 연관 데이터 삭제(bookmark, 구독, 관심사, article, authAccount, userConsent)
3. mailbox `RETIRED` 처리 (재사용 금지)
4. User `deletedAt` 기록 (soft delete)

Provider 연결 해제 실패는 탈퇴를 막지 않습니다. 결과는 응답의 `providerUnlinks`
배열과 서버 warn 로그로 확인합니다.

Response:

```json
{
  "message": "회원 탈퇴가 완료되었습니다.",
  "deletedAt": "2026-08-09T00:00:00.000Z",
  "providerUnlinks": [
    {
      "provider": "KAKAO",
      "unlinked": true
    }
  ]
}
```

`unlinked: false`인 경우 `reason` 필드에 사유가 포함됩니다. 탈퇴 후 같은 소셜
계정으로 다시 로그인하면 신규 회원 플로우(`isRegistered: false`)로 진입하며,
재가입 시 mailbox pool에서 새 구독 이메일을 소모합니다.

## JWKS Caching

Kakao와 Apple 공개키는 `jose`의 `createRemoteJWKSet`으로 조회합니다.
최초 검증 시 원격 JWKS를 조회하고, 이후 프로세스 메모리에서 캐싱합니다.

현재 구조에서는 별도 Redis 캐시가 필요하지 않습니다. 서버 재시작 시 다시
조회됩니다.

## Error Checklist

### Kakao idToken invalid

- Kakao Developers에서 OIDC가 활성화되었는지 확인
- `KAKAO_OIDC_AUDIENCE`와 idToken `aud`가 일치하는지 확인
- 앱에서 전달한 값이 access token이 아니라 idToken인지 확인

### Apple identity token invalid

- `APPLE_CLIENT_ID`가 iOS bundle id와 일치하는지 확인
- Web 요청이면 `APPLE_WEB_CLIENT_ID`가 설정되어 있는지 확인
- 앱에서 전달한 값이 authorization code가 아니라 identity token인지 확인

## Deferred Decisions

- 로컬 로그인/SMS 인증 제거 시점
- Kakao와 Apple 계정 연결 정책
- 이미 생성된 독립 계정 병합 정책
- Web OAuth callback 기반 로그인 지원
