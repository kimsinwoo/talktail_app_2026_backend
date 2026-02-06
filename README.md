# Talktail Backend Server (B2C)

보안을 최우선으로 한 B2C 서비스 백엔드 서버입니다.

## 주요 기능

### 1. 사용자 관리
- 회원가입/로그인 (JWT 인증)
- 비밀번호 해싱 (bcrypt)
- 역할 기반 접근 제어 (RBAC)
- Rate Limiting (브루트포스 공격 방지)

### 2. 펫 관리
- 펫 등록/수정/삭제
- 펫별 건강 데이터 관리

### 3. 허브 및 디바이스 관리
- 허브 등록 및 관리
- 디바이스 연결 및 상태 모니터링
- 실시간 텔레메트리 데이터 수신

### 4. 쇼핑몰 기능
- 상품 관리 (카테고리, 검색, 필터링)
- 장바구니
- 주문 관리
- 결제 처리
- 배송 추적

### 5. 업체 관리 (Vendor)
- 업체 등록 및 승인
- 상품 등록 및 관리
- 주문 관리
- 정산

### 6. 실시간 통신
- Socket.IO (실시간 데이터 전송)
- MQTT (허브/디바이스 통신)

## 보안 기능

1. **인증 및 인가**
   - JWT 토큰 기반 인증
   - Refresh Token 지원
   - 역할 기반 접근 제어

2. **Rate Limiting**
   - 일반 API: 15분당 100회
   - 인증 API: 15분당 5회
   - 회원가입: 1시간당 3회
   - 결제: 1분당 10회

3. **Input Validation**
   - express-validator를 사용한 입력값 검증
   - SQL Injection 방지
   - XSS 방지

4. **보안 헤더**
   - Helmet.js로 보안 헤더 설정
   - CORS 설정

5. **비밀번호 보안**
   - bcrypt 해싱 (12 rounds)
   - 강력한 비밀번호 정책

## 설치

```bash
cd backend
npm install
```

## 환경 설정

`.env.example` 파일을 복사하여 `.env` 파일을 생성하고 설정을 입력하세요:

```bash
cp .env.example .env
```

### 필수 설정

- `JWT_SECRET`: JWT 토큰 서명 키 (최소 32자, 프로덕션에서는 반드시 변경)
- `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `DB_HOST`: 데이터베이스 연결 정보

## 실행

### 개발 모드

```bash
npm run dev
```

### 프로덕션 모드

```bash
npm start
```

## API 엔드포인트

### 인증
- `POST /api/auth/signup` - 회원가입
- `POST /api/auth/login` - 로그인
- `POST /api/auth/refresh` - 토큰 갱신
- `POST /api/auth/logout` - 로그아웃
- `GET /api/auth/me` - 현재 사용자 정보
- `POST /api/auth/change-password` - 비밀번호 변경

### 펫 관리
- `GET /api/pets` - 펫 목록 조회
- `POST /api/pets` - 펫 등록
- `GET /api/pets/:id` - 펫 상세 조회
- `PUT /api/pets/:id` - 펫 수정
- `DELETE /api/pets/:id` - 펫 삭제

### 허브 관리
- `GET /api/hub` - 허브 목록 조회
- `POST /api/hub` - 허브 등록
- `GET /api/hub/:hubAddress` - 허브 상세 조회
- `PUT /api/hub/:hubAddress` - 허브 수정
- `DELETE /api/hub/:hubAddress` - 허브 삭제

### 디바이스 관리
- `GET /api/device` - 디바이스 목록 조회
- `POST /api/device` - 디바이스 등록
- `GET /api/device/:deviceAddress` - 디바이스 상세 조회
- `PUT /api/device/:deviceAddress` - 디바이스 수정
- `DELETE /api/device/:deviceAddress` - 디바이스 삭제

### 텔레메트리
- `GET /api/telemetry/recent/:deviceAddress` - 최근 텔레메트리 데이터 조회
- `GET /api/telemetry/recent` - 모든 디바이스의 최근 데이터 조회

### 상품
- `GET /api/products` - 상품 목록 조회 (페이지네이션, 필터링, 검색)
- `GET /api/products/:id` - 상품 상세 조회
- `POST /api/products` - 상품 등록 (업체/관리자)
- `PUT /api/products/:id` - 상품 수정 (업체/관리자)
- `DELETE /api/products/:id` - 상품 삭제 (업체/관리자)

### 장바구니
- `GET /api/cart` - 장바구니 조회
- `POST /api/cart/items` - 장바구니에 상품 추가
- `PUT /api/cart/items/:id` - 장바구니 항목 수량 변경
- `DELETE /api/cart/items/:id` - 장바구니 항목 삭제
- `DELETE /api/cart` - 장바구니 비우기

### 주문
- `GET /api/orders` - 주문 목록 조회
- `POST /api/orders` - 주문 생성
- `GET /api/orders/:id` - 주문 상세 조회
- `PUT /api/orders/:id/cancel` - 주문 취소
- `PUT /api/orders/:id/ship` - 배송 시작 (업체)
- `PUT /api/orders/:id/deliver` - 배송 완료 (업체)

### 결제
- `POST /api/payments` - 결제 생성
- `GET /api/payments/:id` - 결제 상세 조회
- `POST /api/payments/:id/refund` - 환불 처리

### 업체 관리
- `GET /api/vendor/profile` - 업체 프로필 조회
- `POST /api/vendor/register` - 업체 등록
- `PUT /api/vendor/profile` - 업체 프로필 수정
- `GET /api/vendor/products` - 업체 상품 목록
- `GET /api/vendor/orders` - 업체 주문 목록
- `GET /api/vendor/statistics` - 업체 통계

### 관리자
- `GET /api/admin/vendors` - 업체 목록 조회
- `PUT /api/admin/vendors/:id/approve` - 업체 승인
- `GET /api/admin/orders` - 전체 주문 목록
- `GET /api/admin/statistics` - 플랫폼 통계

## 데이터베이스 모델

- **User**: 사용자 정보
- **Pet**: 펫 정보
- **Hub**: 허브 정보
- **Device**: 디바이스 정보
- **Telemetry**: 텔레메트리 데이터
- **Category**: 상품 카테고리
- **Product**: 상품 정보
- **Vendor**: 업체 정보
- **Order**: 주문 정보
- **OrderItem**: 주문 항목
- **Payment**: 결제 정보
- **Cart**: 장바구니
- **CartItem**: 장바구니 항목

## 보안 체크리스트

- [x] JWT 인증
- [x] 비밀번호 해싱 (bcrypt)
- [x] Rate Limiting
- [x] Input Validation
- [x] SQL Injection 방지 (Sequelize ORM)
- [x] XSS 방지
- [x] CORS 설정
- [x] Helmet.js 보안 헤더
- [x] 에러 처리 및 로깅
- [x] 역할 기반 접근 제어

## 프로덕션 배포 시 주의사항

1. **환경 변수**
   - `JWT_SECRET`을 강력한 랜덤 문자열로 변경 (최소 32자)
   - 데이터베이스 비밀번호를 강력하게 설정
   - `NODE_ENV=production` 설정

2. **데이터베이스**
   - 프로덕션에서는 `sync({ force: false })` 사용
   - 마이그레이션 도구 사용 권장

3. **HTTPS**
   - HTTPS 사용 필수
   - SSL/TLS 인증서 설정

4. **로깅**
   - 로그 파일 관리
   - 민감한 정보 로깅 금지

5. **모니터링**
   - 서버 모니터링 설정
   - 에러 알림 설정

## 개발 참고사항

- 모든 API는 `/api` prefix 사용
- 인증이 필요한 API는 `Authorization: Bearer <token>` 헤더 필요
- 에러 응답은 `{ success: false, message: "..." }` 형식
- 성공 응답은 `{ success: true, data: {...} }` 형식
