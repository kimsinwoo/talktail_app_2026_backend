# 백엔드 최적화 요약

## 적용된 항목

### 1. 응답 압축
- **compression** 미들웨어: JSON 등 텍스트 응답 gzip 압축으로 전송량 감소
- `app.use(compression())` (Body 파서 다음)

### 2. 로깅
- **요청 로그**: `/health` 제외, 프로덕션에서는 `METHOD path`만
- **본문 로그**: 개발 환경에서만 POST/PUT/PATCH body 출력 (비밀번호·토큰 마스킹, 400자 제한)
- `config.server.env !== 'production'` 기준으로 분기

### 3. DB
- **풀**: development max 5, production max 20 / min 5
- **로깅**: development에서만 `DB_LOGGING=true` 시 SQL 로그
- 라우트에서 `attributes`, `include`로 필요한 컬럼만 조회 (hub, device, diaries 등)

### 4. Rate limiting
- API 전역, 인증, 회원가입, OAuth 등 구간별 제한 적용됨

## 추가 권장 사항

- **인덱스**: `user_email`, `pet_code`, `date` 등 자주 쓰는 조건은 모델에 인덱스 있음. 새 쿼리 패턴 생기면 인덱스 검토.
- **캐시**: 자주 바뀌지 않는 읽기(예: 허브 목록)에 Redis 캐시 도입 시 응답 시간 단축 가능.
- **로그 레벨**: 프로덕션 `LOG_LEVEL=warn` 권장.
