# Talktail Backend 배포 가이드

## 프로덕션 배포 체크리스트

### 1. 환경 변수 설정

`.env` 파일을 생성하고 다음 변수들을 설정하세요:

```bash
# 서버 설정
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# 데이터베이스 설정
DB_USERNAME=your_db_username
DB_PASSWORD=your_strong_password
DB_DATABASE=talktail_db
DB_HOST=your_db_host
DB_PORT=3306
DB_SSL=true

# JWT 설정 (반드시 변경!)
JWT_SECRET=your-super-secret-jwt-key-min-32-characters-long
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# 보안 설정
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# MQTT 설정
MQTT_BROKER_URL=mqtt://your-mqtt-broker:1883
MQTT_USERNAME=your_mqtt_username
MQTT_PASSWORD=your_mqtt_password
```

### 2. 데이터베이스 설정

#### MySQL 데이터베이스 생성

```sql
CREATE DATABASE talktail_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'talktail_user'@'%' IDENTIFIED BY 'strong_password';
GRANT ALL PRIVILEGES ON talktail_db.* TO 'talktail_user'@'%';
FLUSH PRIVILEGES;
```

#### 데이터베이스 마이그레이션

프로덕션에서는 `sync({ force: false })`를 사용하거나 Sequelize CLI를 사용하여 마이그레이션을 실행하세요.

### 3. 보안 설정

#### HTTPS 설정

- Nginx 또는 Apache를 리버스 프록시로 사용
- SSL/TLS 인증서 설정 (Let's Encrypt 권장)
- HTTP를 HTTPS로 리다이렉트

#### 방화벽 설정

```bash
# 필요한 포트만 열기
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
```

### 4. 프로세스 관리

#### PM2 사용 (권장)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### systemd 서비스 (대안)

`/etc/systemd/system/talktail-backend.service`:

```ini
[Unit]
Description=Talktail Backend Server
After=network.target

[Service]
Type=simple
User=your_user
WorkingDirectory=/path/to/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 5. 로그 관리

로그 파일은 `logs/` 디렉토리에 저장됩니다:
- `error.log`: 에러 로그
- `combined.log`: 전체 로그
- `exceptions.log`: 예외 로그
- `rejections.log`: Promise 거부 로그

로그 로테이션 설정 (logrotate):

```bash
/path/to/backend/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 your_user your_group
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

### 6. 모니터링

#### 헬스체크

```bash
curl http://localhost:3000/health
```

#### PM2 모니터링

```bash
pm2 monit
pm2 logs
```

### 7. 백업

#### 데이터베이스 백업

```bash
# 매일 자동 백업 (cron)
0 2 * * * mysqldump -u user -p password talktail_db > /backup/talktail_db_$(date +\%Y\%m\%d).sql
```

#### 파일 백업

```bash
# CSV 파일 백업
tar -czf /backup/csv_$(date +%Y%m%d).tar.gz /path/to/backend/data/csv
```

### 8. 성능 최적화

#### Node.js 최적화

```bash
NODE_OPTIONS="--max-old-space-size=2048" node src/server.js
```

#### 데이터베이스 최적화

- 인덱스 최적화
- 쿼리 최적화
- Connection Pool 설정

### 9. 보안 점검

- [ ] JWT_SECRET이 강력한 랜덤 문자열인지 확인
- [ ] 데이터베이스 비밀번호가 강력한지 확인
- [ ] HTTPS가 설정되어 있는지 확인
- [ ] CORS가 올바르게 설정되어 있는지 확인
- [ ] Rate Limiting이 활성화되어 있는지 확인
- [ ] 방화벽이 올바르게 설정되어 있는지 확인
- [ ] 로그에 민감한 정보가 포함되지 않는지 확인

### 10. 테스트

배포 전 다음을 테스트하세요:

```bash
# API 테스트
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234!","name":"Test User",...}'

# 헬스체크
curl http://localhost:3000/health
```

## 문제 해결

### 데이터베이스 연결 오류

- 데이터베이스 서버가 실행 중인지 확인
- 방화벽에서 데이터베이스 포트가 열려 있는지 확인
- 데이터베이스 사용자 권한 확인

### MQTT 연결 오류

- MQTT 브로커가 실행 중인지 확인
- MQTT 인증 정보 확인
- 네트워크 연결 확인

### 메모리 부족

- PM2 클러스터 모드 사용
- Node.js 메모리 제한 증가
- 불필요한 로그 제거

## 업데이트 절차

1. 코드 백업
2. 데이터베이스 백업
3. 새 코드 배포
4. 의존성 설치: `npm install --production`
5. 데이터베이스 마이그레이션 실행
6. 서버 재시작: `pm2 restart talktail-backend`
7. 헬스체크 확인
8. 로그 확인
