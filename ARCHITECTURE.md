# Talktail Backend 아키텍처

## 전체 시스템 구조

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   디바이스   │ ─BLE─→ │    허브     │ ─MQTT─→ │   서버      │
└─────────────┘         └─────────────┘         └─────────────┘
                              │                        │
                              │                        │
                        ┌─────┴─────┐          ┌──────┴──────┐
                        │           │          │             │
                    ┌───▼───┐   ┌──▼──┐    ┌──▼──┐      ┌──▼──┐
                    │  앱   │   │ 앱  │    │ CSV │      │구글 │
                    └───┬───┘   └─────┘    │관리 │      │드라이브│
                        │                  └─────┘      └──────┘
                        └──────HTTP────────┘
```

## 데이터 흐름

### 케이스 A: 허브 기반 수집

1. 디바이스 → 허브 (BLE)
2. 허브 → 서버 (MQTT)
3. 서버 → CSV 파일 저장
4. 앱 → 서버 (HTTP) → CSV 데이터 조회

### 케이스 B: 앱 직접 수집

1. 디바이스 → 앱 (BLE)
2. 앱 → 서버 (HTTP)
3. 서버 → CSV 파일 저장
4. 앱 → 서버 (HTTP) → CSV 데이터 조회

## 핵심 컴포넌트

### 1. MQTT Service (`src/services/mqttService.js`)

- 허브로부터 실시간 데이터 수신
- 토픽 구독:
  - `hub/{hubId}/device/{deviceId}/data`: 디바이스 측정 데이터
  - `hub/{hubId}/heartbeat`: 허브 하트비트
  - `hub/{hubId}/device/{deviceId}/status`: 디바이스 연결 상태

### 2. Connection Manager (`src/services/connectionManager.js`)

- 디바이스 연결 상태 추적
- 허브/앱 연결 소스 관리
- 하트비트 타임아웃 감지
- 자동 전환 이벤트 발생

### 3. CSV Manager (`src/utils/csvManager.js`)

- CSV 파일 생성 및 관리
- 날짜별 파일 분리
- 데이터 append
- 여러 파일 병합

### 4. Google Drive Service (`src/services/googleDriveService.js`)

- 일일 CSV 파일 백업
- 날짜별 폴더 생성
- 파일 업로드 관리

### 5. Notification Service (`src/services/notificationService.js`)

- 이벤트 기반 알림 발송
- 우선순위 관리
- 디바운스 처리

## CSV 파일 규칙

### 파일명 형식

```
{date}_{deviceId}_{petId}_{petName}.csv
```

예: `2026-01-12_device123_pet456_멍멍이.csv`

### 파일 경로

```
{DATA_DIR}/csv/{userEmail}/{petName}/{fileName}
```

### CSV 구조

| 컬럼 | 설명 | 형식 |
|------|------|------|
| timestamp | 서버 시간 | ISO 8601 |
| hr | 심박수 | 숫자 |
| spo2 | 산소포화도 | 숫자 |
| temp | 체온 | 숫자 |
| battery | 배터리 레벨 | 숫자 |
| samplingRate | 샘플링 레이트 | 숫자 |
| source | 데이터 소스 | 'hub' 또는 'app' |
| sessionId | 측정 세션 ID | 문자열 |

### 파일 분리 규칙

- 같은 디바이스 ID
- 같은 반려동물 ID
- 같은 날짜 (00:00 ~ 23:59)

→ 하나의 CSV 파일에 append

- 날짜가 바뀌면 (00:00) → 새 CSV 파일 생성

## 연결 우선순위

1. **허브 연결** (1순위)
   - 허브가 활성화되어 있으면 허브 사용
   - 허브 하트비트 타임아웃 시 연결 끊김으로 판단

2. **앱 연결** (2순위)
   - 허브 연결이 끊기면 앱이 자동으로 BLE 연결 시도
   - 앱은 `/api/connection/device/:deviceId`로 상태 확인 가능

## Notification 분류

### 긴급 (urgent)
- 허브 연결 끊김
- 디바이스 연결 실패
- 데이터 중단
- 배터리 부족

### 중요 (important)
- 자동 전환 성공
- 허브 재연결
- 백업 실패

### 정보 (info)
- 측정 시작
- 일일 기록 저장
- 백업 성공

## 자동 백업

- **시점**: 매일 자정 (00:00)
- **대상**: 전날 생성된 모든 CSV 파일
- **경로**: `talktail_backup/{date}/`
- **알림**: 백업 성공/실패 시 Notification 발송

## API 엔드포인트

### 데이터 전송
```
POST /api/data
```

### CSV 목록 조회
```
GET /api/csv/list?userEmail=...&petName=...&startDate=...&endDate=...
```

### CSV 데이터 조회
```
GET /api/csv/data?userEmail=...&petName=...&startDate=...&endDate=...
```

### 연결 상태 조회
```
GET /api/connection/status
GET /api/connection/device/:deviceId
```

## 확장 가능성

- CSV → 데이터베이스 전환 가능
- Notification → WebSocket/SSE 실시간 전송
- 다중 MQTT 브로커 지원
- 디바이스 펌웨어 버전 관리
- 측정 세션 상세 추적
