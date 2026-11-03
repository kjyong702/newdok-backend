# Social Login

Newdok은 기존 로컬 로그인에서 Kakao / Apple 소셜 로그인 중심 구조로 전환 중입니다.
앱(iOS) 연동을 마쳤고 웹 연동을 진행 중이며, 로컬 로그인과 SMS 인증 API는 완전
전환 전까지 임시 유지합니다.

## Current Policy

- 지원 provider: `KAKAO`, `APPLE`
- 인증 방식: OIDC `idToken` 검증
  - 앱/애플 웹: 클라이언트가 받은 `idToken`을 서버가 검증
  - 카카오 웹: 클라이언트는 인가 코드만 전달하고, 서버가 토큰을 교환해 받은
    `idToken`을 검증
- 내부 사용자 식별 기준: `provider + providerUserId`
- 이메일은 고유 식별자로 사용하지 않음
- Kakao 계정과 Apple 계정은 현재 서로 독립된 Newdok 계정으로 가입 가능
- 계정 연결/병합은 추후 별도 정책 확정 후 구현

## Login Start API

```http
POST /auth/social-login
```

Request (앱):

```json
{
  "provider": "KAKAO",
  "platform": "IOS",
  "idToken": "provider-id-token"
}
```

Request (카카오 웹):

```json
{
  "provider": "KAKAO",
  "platform": "WEB",
  "authorizationCode": "kakao-authorization-code",
  "redirectUri": "http://localhost:3000/login"
}
```

Request (애플 웹):

```json
{
  "provider": "APPLE",
  "platform": "WEB",
  "idToken": "apple-id-token",
  "authorizationCode": "apple-authorization-code",
  "redirectUri": "https://newdok.vercel.app/login"
}
```

### Fields

| Field | Description |
| --- | --- |
| `provider` | `KAKAO` 또는 `APPLE` |
| `platform` | `IOS`, `ANDROID`, `WEB` |
| `idToken` | Provider SDK에서 발급받은 OIDC identity token. 카카오 웹을 제외하고 필수 |
| `authorizationCode` | 카카오 웹: 필수(로그인 후 redirectUri로 받은 code). Apple: 선택(revoke용 refresh token 교환) |
| `redirectUri` | 카카오 웹: 필수(인가 코드 요청에 쓴 값과 동일). Apple 웹: `authorizationCode`와 함께 전달. 앱: 보내지 않음 |

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

audience는 플랫폼별로 다릅니다.

| 플랫폼 | idToken 출처 | audience |
| --- | --- | --- |
| `IOS`, `ANDROID` | 앱 SDK | `KAKAO_OIDC_AUDIENCE` (네이티브 앱 키) |
| `WEB` | 서버의 인가 코드 교환 | `KAKAO_REST_API_KEY`, `KAKAO_JAVASCRIPT_KEY`(설정 시) |

웹이 카카오 JS SDK(`Kakao.Auth.authorize`)로 인가 코드를 받으면 idToken `aud`가
JavaScript 키가 될 수 있어, 그 경우에만 `KAKAO_JAVASCRIPT_KEY`를 설정합니다.

## Kakao Web Login

```text
1. 웹 → 카카오 로그인 (client_id, redirect_uri, response_type=code)
2. 카카오 → 웹 redirect_uri?code=...
3. 웹 → POST /auth/social-login { provider: KAKAO, platform: WEB, authorizationCode, redirectUri }
4. 서버 → POST https://kauth.kakao.com/oauth/token
         (client_id=KAKAO_REST_API_KEY, client_secret=KAKAO_CLIENT_SECRET, code, redirect_uri)
5. 서버가 응답의 id_token을 검증 → 기존/신규 회원 응답
```

- 토큰 교환은 Client Secret을 가진 서버만 수행합니다. REST API 키와 Client
  Secret은 웹에 노출하지 않습니다.
- `KAKAO_CLIENT_SECRET`은 카카오 디벨로퍼스의 "카카오 로그인" Client Secret
  값입니다("비즈니스 인증" 아님). 콘솔에서 비활성화된 경우 비워둡니다.
- 인가 코드 요청에 `scope`를 지정하면 `openid`를 포함해야 응답에 id_token이 옵니다.
- 앱과 웹은 같은 카카오 앱의 키를 쓰므로 회원번호(`sub`)가 같고, 같은 Newdok
  계정으로 로그인됩니다.
- 카카오 디벨로퍼스 설정: Redirect URI 등록(dev `http://localhost:3000/login`,
  prod `https://newdok.vercel.app/login`), JS SDK 사용 시 JavaScript SDK 도메인 등록.

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

웹(Services ID)에서 받은 `authorizationCode`는 인가 요청의 redirect URI와 같은
`redirect_uri`를 함께 보내야 교환됩니다. 웹은 `redirectUri`에 AppleID.auth.init의
`redirectURI`(Services ID에 등록한 Return URL)를 전달합니다. 빠지면 로그인은 되지만
refresh token이 저장되지 않아 탈퇴 시 revoke가 생략됩니다.

Services ID는 iOS 앱의 primary App ID에 묶여 있어야 앱/웹에서 같은 Apple `sub`가
나와 같은 Newdok 계정으로 로그인됩니다. Apple은 Return URL에 localhost를 허용하지
않으므로 dev 웹 테스트에는 HTTPS 주소가 필요합니다.

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

## CORS

- 기본 허용 origin: `https://newdok.vercel.app`, `http://localhost:3000`
- `CORS_ALLOW_ALL_ORIGINS=true`이면 모든 origin을 허용합니다. 웹 테스트 주소가
  자주 바뀌는 dev 서버에만 설정하고 prod에는 설정하지 않습니다.
- API 인증은 쿠키가 아니라 `Authorization: Bearer` 헤더라서, dev에서 전체 허용해도
  다른 사이트가 사용자 토큰을 실어 보낼 수 없습니다.

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

### Kakao authorization code exchange failed (웹)

응답 message에 카카오 에러 본문이 포함됩니다.

- `KOE320` invalid_grant: 인가 코드가 만료(10분)됐거나 이미 사용됨. 새로 로그인해 받은
  code로 1회만 요청
- `KOE303`: `redirectUri`가 인가 코드 요청 때 값과 다름
- `KOE010` invalid_client: `KAKAO_CLIENT_SECRET` 누락/불일치, 또는 REST API 키 불일치
- 응답에 idToken이 없음: OIDC 비활성화 또는 `scope`에 `openid` 누락

### Apple identity token invalid

- `APPLE_CLIENT_ID`가 iOS bundle id와 일치하는지 확인
- Web 요청이면 `APPLE_WEB_CLIENT_ID`가 설정되어 있는지 확인
- 앱에서 전달한 값이 authorization code가 아니라 identity token인지 확인

## Deferred Decisions

- 로컬 로그인/SMS 인증 제거 시점
- Kakao와 Apple 계정 연결 정책
- 이미 생성된 독립 계정 병합 정책
- 서버가 provider redirect를 직접 받는 Web OAuth callback 방식
  (현재는 웹 프론트가 callback을 받아 code를 서버에 전달)
