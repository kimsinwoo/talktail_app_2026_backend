# OAuth 소셜 로그인 설정 가이드

## 개요

모바일 앱(iOS/Android) 전용 OAuth 2.0 소셜 로그인 백엔드입니다.
Google, Kakao, Naver를 지원하며 PKCE와 Refresh Token Rotation을 적용했습니다.

## 보안 기능

### 1. PKCE (Proof Key for Code Exchange)
- Authorization Code Flow에서 code_interceptor 공격 방지
- code_verifier와 code_challenge를 사용한 보안 강화

### 2. State 기반 CSRF 방어
- 각 OAuth 요청마다 고유한 state 생성
- 일회용 사용 (사용 후 즉시 삭제)
- 10분 만료

### 3. Refresh Token Rotation
- 토큰 재사용 감지 시 전체 토큰 폐기
- 새 토큰 발급 시 기존 토큰 자동 폐기
- 재사용 공격 방어

### 4. 토큰 저장 정책
- ❌ access_token: 저장하지 않음
- ❌ id_token: 저장하지 않음
- ✅ refresh_token: 암호화하여 DB에 저장

## 환경 변수 설정

`.env` 파일에 다음 변수들을 설정하세요:

```bash
# JWT 및 암호화
JWT_SECRET=your-secret-key-minimum-32-characters
ENCRYPTION_KEY=your-encryption-key-minimum-32-characters

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_MOBILE_REDIRECT_URI=talktail://oauth/google/callback

# Kakao OAuth
KAKAO_CLIENT_ID=your-kakao-client-id
KAKAO_CLIENT_SECRET=your-kakao-client-secret
KAKAO_MOBILE_REDIRECT_URI=talktail://oauth/kakao/callback

# Naver OAuth
NAVER_CLIENT_ID=your-naver-client-id
NAVER_CLIENT_SECRET=your-naver-client-secret
NAVER_MOBILE_REDIRECT_URI=talktail://oauth/naver/callback
```

## OAuth Provider 설정

### Google

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 프로젝트 생성 또는 선택
3. OAuth 2.0 클라이언트 ID 생성
   - 애플리케이션 유형: iOS 또는 Android
   - 리다이렉트 URI: `talktail://oauth/google/callback`
4. 클라이언트 ID와 Secret을 `.env`에 설정

### Kakao

1. [Kakao Developers](https://developers.kakao.com/) 접속
2. 애플리케이션 생성
3. 플랫폼 설정
   - iOS: Bundle ID 등록
   - Android: 패키지명 등록
4. 리다이렉트 URI 설정: `talktail://oauth/kakao/callback`
5. REST API 키를 `.env`에 설정

### Naver

1. [Naver Developers](https://developers.naver.com/) 접속
2. 애플리케이션 등록
3. 서비스 URL 및 Callback URL 설정
   - Callback URL: `talktail://oauth/naver/callback`
4. Client ID와 Client Secret을 `.env`에 설정

## API 엔드포인트

### 1. OAuth 시작
```
POST /api/auth/:provider/start
Body: {
  redirect_uri?: string  // 선택사항, 기본값 사용
}

Response: {
  success: true,
  data: {
    authorizationUrl: string,  // OAuth 인증 URL
    state: string,             // CSRF 방지용 state
    codeVerifier: string       // PKCE code_verifier (Secure Storage에 저장)
  }
}
```

### 2. OAuth 콜백 처리
```
POST /api/auth/:provider/callback
Body: {
  code: string,           // Authorization Code
  state: string,          // State (검증용)
  code_verifier: string,  // PKCE code_verifier
  redirect_uri?: string   // 선택사항
}

Response: {
  success: true,
  message: string,
  data: {
    accessToken: string,   // 15분 유효
    refreshToken: string,  // 30일 유효
    user: {
      email: string,
      name: string,
      role: string,
      profileImage: string
    },
    isNewUser: boolean
  }
}
```

### 3. 토큰 재발급
```
POST /api/auth/token/refresh
Body: {
  refreshToken: string
}

Response: {
  success: true,
  data: {
    accessToken: string,
    refreshToken: string,  // 새 토큰 (Rotation)
    user: {
      email: string,
      name: string,
      role: string,
      profileImage: string
    }
  }
}
```

### 4. 로그아웃
```
POST /api/auth/logout
Body: {
  refreshToken: string
}

Response: {
  success: true,
  message: "로그아웃 완료"
}
```

### 5. 회원 탈퇴
```
DELETE /api/users/me
Header: Authorization: Bearer <accessToken>

Response: {
  success: true,
  message: "회원 탈퇴가 완료되었습니다."
}
```

## 모바일 앱 연동 방법

### 1. OAuth 시작

```typescript
// 1. OAuth 시작 요청
const response = await fetch('https://api.talktail.com/api/auth/google/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    redirect_uri: 'talktail://oauth/google/callback'
  })
});

const { authorizationUrl, state, codeVerifier } = await response.json();

// 2. codeVerifier를 Secure Storage에 저장
await SecureStore.setItemAsync('oauth_code_verifier', codeVerifier);
await SecureStore.setItemAsync('oauth_state', state);

// 3. OAuth URL 열기 (WebView 또는 외부 브라우저)
await Linking.openURL(authorizationUrl);
```

### 2. OAuth 콜백 처리

```typescript
// Deep Link 핸들러에서
const handleOAuthCallback = async (url: string) => {
  const params = new URLSearchParams(url.split('?')[1]);
  const code = params.get('code');
  const state = params.get('state');

  // 저장된 값 가져오기
  const codeVerifier = await SecureStore.getItemAsync('oauth_code_verifier');
  const savedState = await SecureStore.getItemAsync('oauth_state');

  // State 검증
  if (state !== savedState) {
    throw new Error('Invalid state');
  }

  // 콜백 처리
  const response = await fetch('https://api.talktail.com/api/auth/google/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      state,
      code_verifier: codeVerifier,
      redirect_uri: 'talktail://oauth/google/callback'
    })
  });

  const { accessToken, refreshToken, user } = await response.json();

  // 토큰을 Secure Storage에 저장
  await SecureStore.setItemAsync('access_token', accessToken);
  await SecureStore.setItemAsync('refresh_token', refreshToken);

  // 임시 값 삭제
  await SecureStore.deleteItemAsync('oauth_code_verifier');
  await SecureStore.deleteItemAsync('oauth_state');
};
```

### 3. 토큰 재발급

```typescript
const refreshAccessToken = async () => {
  const refreshToken = await SecureStore.getItemAsync('refresh_token');

  const response = await fetch('https://api.talktail.com/api/auth/token/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });

  const { accessToken, refreshToken: newRefreshToken } = await response.json();

  // 새 토큰 저장
  await SecureStore.setItemAsync('access_token', accessToken);
  await SecureStore.setItemAsync('refresh_token', newRefreshToken);
};
```

## 보안 주의사항

1. **code_verifier 보안**
   - Secure Storage에만 저장
   - 네트워크 전송 시 HTTPS 필수
   - 사용 후 즉시 삭제

2. **State 검증**
   - 항상 state를 검증
   - 일회용 사용 (재사용 불가)

3. **토큰 저장**
   - access_token: 메모리에만 저장 (앱 종료 시 삭제)
   - refresh_token: Secure Storage에 저장

4. **HTTPS 필수**
   - 모든 API 통신은 HTTPS 사용
   - 개발 환경에서도 가능하면 HTTPS 사용

## 에러 처리

### 일반적인 에러

- `400 Bad Request`: 잘못된 요청 파라미터
- `401 Unauthorized`: 인증 실패
- `403 Forbidden`: 권한 없음
- `404 Not Found`: 리소스 없음
- `500 Internal Server Error`: 서버 오류

### OAuth 특정 에러

- `Invalid or expired state`: State 검증 실패
- `Invalid code_verifier`: PKCE 검증 실패
- `Refresh token has expired`: Refresh Token 만료
- `Refresh token not found or already used`: 토큰 재사용 감지

## 프로덕션 체크리스트

- [ ] JWT_SECRET 변경 (최소 32자)
- [ ] ENCRYPTION_KEY 변경 (최소 32자)
- [ ] OAuth Client ID/Secret 설정
- [ ] HTTPS 사용
- [ ] State Store를 Redis로 교체 (선택사항)
- [ ] Google id_token 서명 검증 구현 (JWKS 사용)
- [ ] Rate Limiting 설정 확인
- [ ] 로깅 설정 확인
- [ ] 모니터링 설정
