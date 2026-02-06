# 210.90.113.200 배포/오픈 체크리스트 (즉시 실행용)

## 0) 목표
- 외부에서 `http://210.90.113.200:3000/health` 가 **즉시 응답**하도록 만든다.
- 앱은 `http://210.90.113.200:3000/api/...` 로 통신한다.

---

## 1) 서버에서 백엔드 프로세스가 실제로 떠있는지 확인

```bash
sudo ss -ltnp | grep ':3000' || true
ps aux | grep talktail-backend | grep -v grep || true
```

서버 내부에서부터 확인:

```bash
curl -v http://127.0.0.1:3000/health
```

여기서 응답이 안 나오면, **프로세스가 안 떠있거나** **0.0.0.0 바인딩이 아니라** 내부에서도 안 뜬 상태입니다.

---

## 2) 백엔드 실행 (PM2 권장)

### Node 설치/확인

```bash
node -v
npm -v
```

### 실행

```bash
cd /path/to/talktailForPet/backend
npm ci
npx pm2 start ecosystem.config.js
npx pm2 save
npx pm2 status
```

---

## 3) 방화벽/보안그룹에서 3000/tcp 오픈 (외부 접속 타임아웃 해결)

### (A) Ubuntu ufw 사용 시

```bash
sudo ufw status
sudo ufw allow 3000/tcp
sudo ufw reload
```

### (B) CentOS/RHEL firewalld 사용 시

```bash
sudo firewall-cmd --state
sudo firewall-cmd --add-port=3000/tcp --permanent
sudo firewall-cmd --reload
sudo firewall-cmd --list-ports
```

### (C) 클라우드(예: AWS)인 경우
- EC2 Security Group Inbound에 **TCP 3000** 을 추가해야 합니다.

---

## 4) 외부에서 최종 검증

서버 밖(로컬 PC 또는 휴대폰)에서:

```bash
curl -v http://210.90.113.200:3000/health
```

정상이면 아래도 성공해야 합니다:

```bash
curl -s -X POST http://210.90.113.200:3000/api/user/login \
  -H 'Content-Type: application/json' \
  -d '{"id":"admin","password":"1234"}'
```

---

## 5) 앱 설정
- 앱 API 주소: `http://210.90.113.200:3000/api`

