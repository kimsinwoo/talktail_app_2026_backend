# MQTT 설정 가이드

## 현재 상태

MQTT 브로커가 없어도 서버는 정상적으로 실행됩니다.
- MQTT 연결 실패 시 경고만 표시하고 서버는 계속 실행
- HTTP API는 정상 작동
- MQTT 기능만 비활성화됨

## MQTT 브로커 설정 (선택사항)

MQTT 기능을 사용하려면 MQTT 브로커를 설치하고 실행해야 합니다.

### 1. Mosquitto 설치 (로컬)

#### macOS
```bash
brew install mosquitto
brew services start mosquitto
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install mosquitto mosquitto-clients
sudo systemctl start mosquitto
sudo systemctl enable mosquitto
```

#### Windows
1. [Mosquitto 다운로드](https://mosquitto.org/download/)
2. 설치 후 서비스 시작

### 2. 환경 변수 설정

`.env` 파일에 MQTT 설정 추가:

```env
# MQTT 설정 (선택사항)
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_CLIENT_ID=talktail-server
```

### 3. MQTT 브로커 테스트

```bash
# 터미널 1: 구독
mosquitto_sub -h localhost -t "test/topic"

# 터미널 2: 발행
mosquitto_pub -h localhost -t "test/topic" -m "Hello MQTT"
```

### 4. 서버 재시작

```bash
cd backend
npm start
```

## MQTT 없이 사용하기

MQTT 브로커 없이도 다음 기능은 정상 작동합니다:
- ✅ HTTP API (데이터 전송, 조회 등)
- ✅ CSV 파일 저장
- ✅ 세션 관리
- ✅ 디바이스 모니터링
- ✅ 알림 서비스

MQTT가 필요한 경우:
- ❌ 허브를 통한 데이터 수신 (MQTT 필요)
- ✅ 앱을 통한 직접 데이터 전송 (HTTP API 사용)

## 문제 해결

### MQTT 연결 오류가 계속 발생하는 경우

1. **브로커가 실행 중인지 확인**
   ```bash
   # macOS/Linux
   ps aux | grep mosquitto
   
   # 또는
   mosquitto -v
   ```

2. **포트 확인**
   ```bash
   # 1883 포트가 열려있는지 확인
   netstat -an | grep 1883
   # 또는
   lsof -i :1883
   ```

3. **방화벽 확인**
   - 로컬 방화벽에서 1883 포트 허용 확인

4. **MQTT 비활성화**
   - `.env` 파일에서 `MQTT_BROKER_URL`을 비워두거나 주석 처리
   - 서버는 MQTT 없이 정상 실행됨

## 로그 확인

서버 로그에서 MQTT 상태 확인:
```
info: MQTT 브로커 연결 성공
또는
warn: MQTT 브로커에 연결할 수 없습니다. MQTT 기능이 비활성화됩니다.
```

Health check 엔드포인트:
```bash
curl http://localhost:3000/health
```

응답:
```json
{
  "status": "ok",
  "timestamp": "2026-01-12T10:18:42.000Z",
  "mqtt": false,  // MQTT 연결 상태
  "googleDrive": false
}
```
