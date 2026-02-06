# Talktail 백엔드 API 문서

- **Base URL**: `http://localhost:4000/api`
- **인증 방식**: JWT Bearer Token  
  → `Authorization: Bearer <token>`
- **공통 응답**

```json
성공: {"success": true, "data": ..., "message": "..."}
실패: {"success": false, "message": "에러 내용"}
```

---

# ✅ 목차

- Auth (인증)
- Users (사용자)
- Org (사용자 프로필)
- Pets (펫)
- Hub (허브)
- Device (디바이스)
- Telemetry (측정 데이터)
- CSV

---

## ▶️ 1. 인증 (Auth)

**Prefix**: `/api/auth`

### 📍 Endpoint 목록

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| POST | `/signup` | ❌ | 회원가입 |
| POST | `/login` | ❌ | 로그인 |
| POST | `/refresh` | ❌ | 토큰 갱신 |
| POST | `/logout` | ✅ | 로그아웃 |
| GET | `/me` | ✅ | 현재 사용자 |
| POST | `/change-password` | ✅ | 비밀번호 변경 |
| PUT | `/update` | ✅ | 비밀번호만 수정 |

---

### 🔽 POST /signup (회원가입)

**Request Body**

```json
{
  "email": "user@example.com",
  "password": "비밀번호 8자 이상",
  "name": "홍길동",
  "phone": "01012345678",
  "postcode": "12345",
  "address": "서울시 강남구",
  "detail_address": "상세주소",
  "marketingAgreed": false
}
```

**Response (201)**

```json
{
  "success": true,
  "message": "회원가입이 완료되었습니다.",
  "data": {
    "token": "JWT_ACCESS_TOKEN",
    "user": {
      "email": "...",
      "name": "...",
      "role": "user"
    }
  }
}
```

---

### 🔽 POST /login (로그인)

**Request Body**

```json
{
  "email": "user@example.com",
  "password": "비밀번호"
}
```

**Response (200)**

```json
{
  "success": true,
  "message": "로그인 성공",
  "data": {
    "token": "JWT_ACCESS_TOKEN",
    "refreshToken": "JWT_REFRESH_TOKEN",
    "user": {
      "email": "...",
      "name": "...",
      "role": "user"
    }
  }
}
```

---

### 🔽 GET /me (현재 사용자)

**Headers**

```
Authorization: Bearer <token>
```

**Response (200)**

```json
{
  "success": true,
  "data": {
    "user": {
      "email": "...",
      "name": "...",
      "phone": "...",
      "role": "user",
      "createdAt": "..."
    }
  }
}
```

---

## ▶️ 2. 사용자 (Users)

**Prefix**: `/api/users`

### 📍 Endpoint 목록

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| DELETE | `/me` | ✅ | 회원 탈퇴 |
| PUT | `/me/fcm-token` | ✅ | FCM 디바이스 토큰 등록 (푸시 알림 수신용) |

---

### 🔽 PUT /me/fcm-token (FCM 토큰 등록)

휴대폰 푸시 알림(일기/상태 체크 리마인더) 수신을 위해 앱에서 FCM 디바이스 토큰을 등록합니다.  
등록된 사용자에게 **오늘 일기 미완료** 시 일기 리마인더, **오늘 상태 체크 미완료** 시 상태 체크 리마인더를 **2시간에 한 번씩** 백그라운드에서 발송합니다. (해당 항목을 완료하면 당일 해당 알림은 더 이상 발송하지 않음)

**Request Body**

```json
{
  "fcm_token": "FCM_디바이스_토큰_문자열"
}
```

- `fcm_token`을 빈 문자열로 보내면 토큰 삭제(푸시 수신 해제).

**Response (200)**

```json
{
  "success": true,
  "data": { "registered": true }
}
```

---

### 🔽 DELETE /me

**Headers**

```
Authorization: Bearer <token>
```

**Response (200)**

```json
{
  "success": true,
  "message": "회원 탈퇴 완료"
}
```

---

## ▶️ 3. 사용자 프로필 (Org)

**Prefix**: `/api/org`  
일반 사용자(일반인) 대상 앱용 프로필·계정 관리 API입니다. (기관용 아님)

### 📍 Endpoint 목록

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| POST | `/load` | ✅ | 사용자 정보 조회 |
| POST | `/update` | ✅ | 사용자 정보 수정 |
| POST | `/changeInfo` | ✅ | 사용자 정보 수정 (앱 호환) |
| POST | `/changePW` | ✅ | 비밀번호 변경 |
| POST | `/verifyPassword` | ✅ | 비밀번호 검증 |
| POST | `/loadAgree` | ✅ | 약관 동의 조회 |
| POST | `/changeAgree` | ✅ | 약관 동의 저장 |
| POST | `/delete` | ✅ | 계정 삭제(회원 탈퇴) |
| DELETE | `/` | ✅ | 계정 삭제(회원 탈퇴) |

---

### 🔽 POST /load

**Headers**

```
Authorization: Bearer <token>
```

**Request Body**: 없음 (인증은 헤더만 사용)

**Response**

```json
{
  "success": true,
  "data": {
    "device_code": "",
    "org_name": "사용자 이름",
    "org_address": "주소",
    "org_id": "user@example.com",
    "org_pw": "",
    "org_phone": "01012345678",
    "org_email": "user@example.com"
  }
}
```

---

## ▶️ 4. 펫 (Pets)

**Prefix**: `/api/pets`

### 📍 Endpoint 목록

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/` | ✅ | 펫 목록 |
| GET | `/:id` | ✅ | 펫 상세 |
| POST | `/` | ✅ | 펫 등록 |
| PUT | `/:id` | ✅ | 펫 수정 |
| DELETE | `/:id` | ✅ | 펫 삭제 |

---

### 🔽 POST / (펫 등록)

**Request Body**

```json
{
  "name": "초코",
  "species": "dog",
  "breed": "푸들",
  "weight": "3.2",
  "gender": "male",
  "neutering": "yes",
  "birthDate": "2021-05-01",
  "device_address": null
}
```

**Response**

```json
{
  "success": true,
  "message": "펫이 등록되었습니다."
}
```

---

## ▶️ 5. 허브 (Hub)

**Prefix**: `/api/hub`

### 📍 Endpoint 목록

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/` | ✅ | 허브 목록 |
| POST | `/` | ✅ | 허브 등록 |
| PUT | `/:hubAddress` | ✅ | 허브 수정 |
| DELETE | `/:hubAddress` | ✅ | 허브 삭제 |

---

### 🔽 POST / (허브 등록)

**Request Body**

```json
{
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "name": "Tailing Hub"
}
```

---

## ▶️ 6. 디바이스 (Device)

**Prefix**: `/api/device`

### 📍 Endpoint 목록

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/` | ✅ | 디바이스 목록 |
| POST | `/` | ✅ | 디바이스 등록 |
| PUT | `/:deviceAddress/pet` | ✅ | 펫 연결 |
| DELETE | `/:deviceAddress` | ✅ | 디바이스 삭제 |

---

### 🔽 PUT /:deviceAddress/pet (펫 연결)

**Request Body**

```json
{
  "petId": 1
}
```

**Response**

```json
{
  "success": true,
  "message": "펫이 연결되었습니다."
}
```

---

## ▶️ 7. Telemetry (측정 데이터)

**Prefix**: `/api/telemetry`

### 📍 Endpoint 목록

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/recent/:deviceAddress` | ✅ | 최근 데이터 |
| GET | `/latest/:deviceId` | ✅ | 최신 1개 |

---

### 🔽 GET /latest/:deviceId

**Response**

```json
{
  "success": true,
  "deviceId": "AA:BB:CC:DD:EE:FF",
  "data": {
    "spo2": 98,
    "hr": 120,
    "temp": 38.2
  }
}
```

---

## ▶️ 8. CSV

**Prefix**: `/api/csv`

### 📍 Endpoint 목록

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/device/:deviceAddress` | ✅ | CSV 목록 |
| GET | `/download?path=...` | ✅ | CSV 다운로드 |
| DELETE | `/?path=...` | ✅ | CSV 삭제 |

---

# ✅ 공통 규칙

- 인증 필요 시 반드시 Header 포함

```
Authorization: Bearer <JWT>
```

- MAC 주소 형식

```
AA:BB:CC:DD:EE:FF
AA-BB-CC-DD-EE-FF
```

- 토큰 만료 시 응답

```json
{
  "success": false,
  "message": "Unauthorized"
}
```
