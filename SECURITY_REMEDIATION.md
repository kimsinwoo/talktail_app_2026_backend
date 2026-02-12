# Talktail 보안 수정 계획 (Security Remediation Plan)

Express.js(JavaScript), Sequelize, React Native, AWS EC2 배포 환경을 위한 프로덕션급 보안 수정 계획입니다.  
침투 테스트를 전제로 하며, 약한 설계는 허용하지 않습니다.

---

## 1. Immediate Critical Fixes (즉시 적용 필수)
 
### 1.1 JWT Secret – Fallback 제거

**문제:** `config/index.js`에서 `JWT_SECRET`이 없을 때 기본값 사용.

**수정:** 프로덕션뿐 아니라 **개발 환경에서도** 서버 기동 시 시크릿 미설정이면 **기동 실패**하도록 합니다.

```javascript
// config/index.js
jwt: {
  secret: (() => {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.trim() === '') {
      throw new Error('JWT_SECRET environment variable is required. Do not use a default.');
    }
    if (secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters.');
    }
    return secret;
  })(),
  expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
},
```

- `.env.example`에 `JWT_SECRET=` (값 없음) 및 설명 추가.
- `validateEnv.js`에서 이미 JWT_SECRET 검사 중이면, config에서 throw하는 방식과 중복되지 않게 하나로 통일.

### 1.2 Rate Limit – 개발 환경에서도 활성화 (옵션: 완화)

**문제:** `rateLimitDisabled` 또는 `isDev`일 때 모든 rate limit이 skip됨 → 로그인/비밀번호 재설정 브루트포스 가능.

**수정:** 인증/비밀번호 재설정은 **환경과 무관하게** 항상 rate limit 적용. 일반 API만 개발 시 완화.

```javascript
// middlewares/rateLimiter.js – authLimiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, message: '로그인 시도 횟수를 초과했습니다. 15분 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => false,  // 항상 적용 (개발에서도)
});
// passwordResetLimiter, tokenRefreshLimiter 동일: skip 제거 또는 skip: () => false
```

### 1.3 JSON Body Size – DoS 완화

**문제:** `express.json({ limit: '10mb' })` → 대용량 JSON으로 리소스 소모 가능.

**수정:** API 특성에 맞게 100KB~500KB로 제한. 파일 업로드는 multipart로만.

```javascript
// server.js
const BODY_LIMIT = process.env.BODY_LIMIT || '256kb';
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
```

### 1.4 CORS – 프로덕션 고정

**문제:** `corsOrigin` 또는 `allowedOrigins`가 `*`이거나 과도하게 넓으면 크레덴셜 탈취 위험.

**수정:** 프로덕션에서는 화이트리스트만 허용.

```javascript
// config – security
corsOrigin: process.env.CORS_ORIGIN || (config.server.env === 'production' ? '' : 'http://localhost:3000'),
allowedOrigins: process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : (config.server.env === 'production' ? [] : ['http://localhost:3000', 'http://localhost:5173']),
```

```javascript
// server.js
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / Postman 등
    if (config.security.allowedOrigins.length === 0) return cb(null, true); // dev
    if (config.security.allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));
```

---

## 2. Authentication Refactor (JWT + Refresh Rotation)

### 2.1 JWT 설정 (fallback 없음)

- 위 1.1 적용.
- Access Token: 15m, Refresh: 7d 권장 (30d는 재사용 공격 윈도우가 김).

### 2.2 Refresh Token Rotation 패턴

**요구사항:** Refresh 토큰은 1회 사용 후 폐기하고 새 Refresh 토큰 발급. 재사용 시 해당 사용자의 모든 Refresh 토큰 무효화(탐지 시).

- DB: `RefreshTokens` 테이블 사용 (tokenHash, userId, expiresAt, revokedAt, replacedBy).
- 로그인 시: Refresh 토큰 생성 → SHA-256 해시 저장 → `RefreshTokens`에 insert.
- `/auth/refresh` 호출 시:
  - 요청 Refresh 토큰의 해시로 DB 조회.
  - 없거나 revoked/만료 → "유효하지 않은 refresh 토큰입니다." (동일 메시지).
  - **재사용 의심:** 동일 tokenHash가 이미 revoked 상태이면 → 해당 userId의 모든 Refresh 토큰 revoke → 401 동일 메시지 (보안 이벤트 로그).
  - 정상이면: 기존 토큰 revoke + replacedBy 설정 → 새 Access + 새 Refresh 발급 → 새 Refresh 해시로 insert.

```javascript
// services/refreshTokenService.js (신규)
const crypto = require('crypto');
const db = require('../models');
const config = require('../config');
const jwt = require('jsonwebtoken');

const REFRESH_EXPIRES = config.jwt.refreshExpiresIn || '7d';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createRefreshToken(userId, userAgent, ipAddress) {
  const token = jwt.sign(
    { email: userId, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: REFRESH_EXPIRES }
  );
  const tokenHash = hashToken(token);
  const decoded = jwt.decode(token);
  const expiresAt = new Date(decoded.exp * 1000);

  await db.RefreshToken.create({
    userId,
    token: tokenHash,
    tokenHash,
    expiresAt,
    userAgent: (userAgent || '').slice(0, 500),
    ipAddress: (ipAddress || '').slice(0, 50),
  });
  return token;
}

async function findValidToken(tokenHash) {
  const tokenRecord = await db.RefreshToken.findOne({
    where: {
      tokenHash,
      revokedAt: null,
    },
  });
  if (!tokenRecord) return null;
  if (new Date() > tokenRecord.expiresAt) return null;
  return tokenRecord;
}

async function revokeTokenById(id, replacedBy = null) {
  await db.RefreshToken.update(
    { revokedAt: new Date(), replacedBy },
    { where: { id } }
  );
}

async function revokeAllForUser(userId) {
  await db.RefreshToken.update(
    { revokedAt: new Date() },
    { where: { userId } }
  );
}

async function isTokenReused(tokenHash) {
  const record = await db.RefreshToken.findOne({ where: { tokenHash } });
  return record && record.revokedAt !== null;
}

module.exports = {
  hashToken,
  createRefreshToken,
  findValidToken,
  revokeTokenById,
  revokeAllForUser,
  isTokenReused,
};
```

```javascript
// routes/auth.js – 로그인 시
const refreshTokenService = require('../services/refreshTokenService');
// ...
const refreshToken = await refreshTokenService.createRefreshToken(
  user.email,
  req.get('user-agent'),
  req.ip
);
// User.refreshToken 필드에 저장하지 말고 RefreshTokens 테이블만 사용
```

```javascript
// POST /api/auth/refresh
router.post('/refresh', tokenRefreshLimiter, async (req, res, next) => {
  try {
    const { refreshToken: raw } = req.body;
    if (!raw) {
      throw new AppError('Refresh 토큰이 필요합니다.', 400);
    }
    const tokenHash = refreshTokenService.hashToken(raw);
    const reused = await refreshTokenService.isTokenReused(tokenHash);
    if (reused) {
      const record = await db.RefreshToken.findOne({ where: { tokenHash } });
      if (record) await refreshTokenService.revokeAllForUser(record.userId);
      logger.warn('Refresh token reuse detected', { userId: record?.userId });
      throw new AppError('유효하지 않은 refresh 토큰입니다.', 401);
    }
    let decoded;
    try {
      decoded = jwt.verify(raw, config.jwt.secret);
    } catch {
      throw new AppError('유효하지 않은 refresh 토큰입니다.', 401);
    }
    const tokenRecord = await refreshTokenService.findValidToken(tokenHash);
    if (!tokenRecord) {
      throw new AppError('유효하지 않은 refresh 토큰입니다.', 401);
    }
    await refreshTokenService.revokeTokenById(tokenRecord.id);
    const newAccess = jwt.sign(
      { email: tokenRecord.userId, name: '', role: '' },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
    const newRefresh = await refreshTokenService.createRefreshToken(
      tokenRecord.userId,
      req.get('user-agent'),
      req.ip
    );
    res.json({
      success: true,
      data: { token: newAccess, refreshToken: newRefresh },
    });
  } catch (error) {
    next(error);
  }
});
```

- 로그아웃 시: 해당 사용자의 RefreshTokens 중 현재 사용 중인 것만 revoke하거나, 로그아웃 시 클라이언트가 보낸 refreshToken 해시로 revoke.

---

## 3. Password Reset Secure Flow

**요구사항:** DB에 해시된 리셋 토큰, 만료, 시도 제한.

### 3.1 DB 모델: PasswordResetToken

```javascript
// models/PasswordResetToken.js
module.exports = (sequelize, DataTypes) => {
  const PasswordResetToken = sequelize.define('PasswordResetToken', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.STRING(100), allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    attemptCount: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false },
    maxAttempts: { type: DataTypes.INTEGER, defaultValue: 5, allowNull: false },
    usedAt: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'PasswordResetTokens',
    indexes: [
      { fields: ['userId'] },
      { fields: ['tokenHash'], unique: true },
      { fields: ['expiresAt'] },
    ],
  });
  PasswordResetToken.associate = (db) => {
    PasswordResetToken.belongsTo(db.User, { foreignKey: 'userId', targetKey: 'email' });
  };
  return PasswordResetToken;
};
```

### 3.2 서비스: 생성/검증/소비

- 토큰 생성: crypto.randomBytes(32).toString('hex'), 만료 15분, tokenHash = SHA-256(token), DB insert.
- 검증: tokenHash로 조회, expiresAt > now, usedAt === null, attemptCount < maxAttempts.
- 시도 시 attemptCount++ (실패해도 증가). 성공 시 usedAt 설정, 비밀번호 변경.

```javascript
// services/passwordResetService.js
const crypto = require('crypto');
const db = require('../models');
const config = require('../config');

const TOKEN_EXPIRY_MINUTES = 15;
const MAX_ATTEMPTS = 5;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createResetToken(userId) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);
  await db.PasswordResetToken.create({
    userId,
    tokenHash,
    expiresAt,
    attemptCount: 0,
    maxAttempts: MAX_ATTEMPTS,
  });
  return { token, expiresAt };
}

async function consumeResetToken(token) {
  const tokenHash = hashToken(token);
  const record = await db.PasswordResetToken.findOne({
    where: { tokenHash },
    include: [{ model: db.User, as: 'User', attributes: ['email'] }],
  });
  if (!record) return null;
  await record.increment('attemptCount');
  if (record.attemptCount > record.maxAttempts) return null;
  if (new Date() > record.expiresAt) return null;
  if (record.usedAt) return null;
  await record.update({ usedAt: new Date() });
  return record.User?.email || record.userId;
}

module.exports = { createResetToken, consumeResetToken, hashToken };
```

### 3.3 라우트

- `POST /auth/forgot-password`: 이메일 존재 여부와 무관하게 동일 메시지 ("해당 이메일로 안내를 보냈습니다."). 존재하면 DB에 리셋 토큰 생성, 이메일로 링크(토큰 포함) 발송. Rate limit 유지.
- `POST /auth/reset-password`: Body `{ token, newPassword }`. `consumeResetToken(token)` → 성공 시 비밀번호 업데이트. 실패 시 동일 메시지 ("링크가 만료되었거나 잘못되었습니다. 다시 요청해 주세요.").

---

## 4. IDOR Elimination Pattern (Device Ownership Middleware)

디바이스/허브/펫 등 리소스 접근 시 **항상** 현재 사용자 소유인지 검증하는 미들웨어를 두고, 라우트에서는 한 번만 붙이면 됩니다.

```javascript
// middlewares/deviceOwnership.js
const db = require('../models');
const { AppError } = require('./errorHandler');

/**
 * req.params[paramName]에 디바이스 주소가 있다고 가정하고,
 * 해당 디바이스가 req.user.email 소유인지 검증.
 * 실패 시 404 (리소스 없음으로 통일하여 열거 방지).
 */
function requireDeviceOwnership(paramName = 'deviceAddress') {
  return async function (req, res, next) {
    const address = req.params[paramName];
    if (!address) return next(new AppError('디바이스 식별자가 필요합니다.', 400));
    const device = await db.Device.findOne({
      where: { address, user_email: req.user?.email },
      attributes: ['address', 'user_email'],
    });
    if (!device) {
      return next(new AppError('디바이스를 찾을 수 없습니다.', 404));
    }
    req.device = device;
    next();
  };
}

function requireHubOwnership(paramName = 'hubAddress') {
  return async function (req, res, next) {
    const address = req.params[paramName];
    if (!address) return next(new AppError('허브 식별자가 필요합니다.', 400));
    const hub = await db.Hub.findOne({
      where: { address, user_email: req.user?.email },
      attributes: ['address', 'user_email'],
    });
    if (!hub) return next(new AppError('허브를 찾을 수 없습니다.', 404));
    req.hub = hub;
    next();
  };
}

function requirePetOwnership(paramName = 'petId') {
  return async function (req, res, next) {
    const id = req.params[paramName];
    if (!id) return next(new AppError('펫 식별자가 필요합니다.', 400));
    const pet = await db.Pet.findOne({
      where: { id, user_email: req.user?.email },
      attributes: ['id', 'user_email'],
    });
    if (!pet) return next(new AppError('펫을 찾을 수 없습니다.', 404));
    req.pet = pet;
    next();
  };
}

module.exports = {
  requireDeviceOwnership,
  requireHubOwnership,
  requirePetOwnership,
};
```

**사용 예:**

```javascript
router.get('/:deviceAddress', verifyToken, requireDeviceOwnership('deviceAddress'), async (req, res) => {
  const device = await db.Device.findByPk(req.device.address, { ... });
  res.json({ success: true, data: device });
});
```

---

## 5. Secure File Handling (Path Traversal Prevention)

CSV 다운로드/삭제는 **반드시** `path.resolve`로 기준 디렉토리를 절대 경로로 만든 뒤, 최종 경로가 그 기준 **내부**에 있는지 검사합니다.

```javascript
// middlewares/pathSecurity.js
const path = require('path');
const fs = require('fs');
const { AppError } = require('./errorHandler');

/**
 * baseDir: 절대 경로로 해석된 사용자별 CSV 루트 (예: /app/data/csv/user_xxx)
 * requestedPath: 쿼리/파라미터에서 온 상대 경로 (.. 금지)
 * returns: 절대 경로 (baseDir 내부만)
 */
function resolvePathWithinBase(baseDir, requestedPath) {
  if (!requestedPath || typeof requestedPath !== 'string') {
    throw new AppError('파일 경로가 필요합니다.', 400);
  }
  const normalized = path.normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, '');
  if (normalized.startsWith('..') || path.isAbsolute(requestedPath)) {
    throw new AppError('잘못된 파일 경로입니다.', 400);
  }
  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(resolvedBase, normalized);
  if (!resolvedPath.startsWith(resolvedBase) || resolvedPath === resolvedBase) {
    throw new AppError('접근 권한이 없습니다.', 403);
  }
  return resolvedPath;
}

function assertFileExists(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new AppError('파일을 찾을 수 없습니다.', 404);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('파일을 찾을 수 없습니다.', 404);
  }
}

module.exports = { resolvePathWithinBase, assertFileExists };
```

**CSV 다운로드 라우트 예:**

```javascript
const { resolvePathWithinBase, assertFileExists } = require('../middlewares/pathSecurity');
const CSV_BASE_DIR = path.join(process.cwd(), 'data', 'csv');

router.get('/download', verifyToken, apiLimiter, async (req, res, next) => {
  try {
    const userCsvDir = path.join(CSV_BASE_DIR, req.user.email.replace(/[^a-zA-Z0-9@._-]/g, '_'));
    const fullPath = resolvePathWithinBase(userCsvDir, req.query.path);
    assertFileExists(fullPath);
    res.download(fullPath, path.basename(fullPath), (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (e) {
    next(e);
  }
});
```

---

## 6. CSV Injection Mitigation Strategy

- **다운로드 파일명/내용:** 사용자 제어 문자열을 그대로 파일명이나 CSV 셀에 넣지 않습니다. 파일명은 서버가 정한 패턴만 (예: `deviceId_date.csv`). CSV 셀은 숫자/날짜는 그대로, 문자열은 이스케이프(필드 앞에 `'` 붙이거나, 따옴표 이스케이프).
- **로그:** 사용자 입력을 로그에 넣을 때는 `sanitizeForLog(input)` 적용 (아래 9절).

```javascript
// utils/sanitize.js
function sanitizeCsvCell(value) {
  if (value == null) return '';
  const s = String(value);
  if (/^[=+\-@\t\r\n]/.test(s)) {
    return "'" + s.replace(/'/g, "''") + "'";
  }
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function sanitizeForLog(value) {
  if (value == null) return '';
  return String(value).replace(/[\r\n\t]/g, ' ').slice(0, 200);
}
```

---

## 7. Rate Limiting Strategy

| 대상 | 윈도우 | max | 비고 |
|------|--------|-----|------|
| 로그인 | 15분 | 50 | skip 제거, skipSuccessfulRequests: true |
| 비밀번호 재설정 요청 | 1시간 | 10 | 항상 적용 |
| 비밀번호 재설정 확인(코드 입력) | 1시간 | 20 | 항상 적용 |
| 토큰 재발급 | 15분 | 30 | 항상 적용 |
| 회원가입 | 1시간 | 20 | 프로덕션 필수 |
| 일반 API | 15분 | 5000 | 개발에서만 완화 가능 |

- 개발에서도 auth/password-reset/token-refresh limiter는 **skip: () => false**로 두는 것을 권장.

---

## 8. Error Response Standardization (User Enumeration 방지)

- 로그인 실패: "이메일 또는 비밀번호가 올바르지 않습니다." (계정 존재 여부와 무관)
- 비밀번호 재설정 요청: "해당 이메일로 안내를 보냈습니다." (존재하지 않아도 동일)
- 비밀번호 재설정 확인 실패: "링크가 만료되었거나 잘못되었습니다. 다시 요청해 주세요."
- Refresh 토큰 실패: "유효하지 않은 refresh 토큰입니다."
- 리소스 없음(디바이스/허브/펫): "해당 리소스를 찾을 수 없습니다." (403/404 구분 없이 404로 통일 가능)

`secureResponses.js`에서 공통 메시지 상수로 관리하고, 에러 핸들러에서 4xx 응답 시 메시지를 노출하지 않거나 위 메시지로만 통일할 수 있습니다.

---

## 9. Logging Hardening

- 로그에 **비밀번호, 토큰, 전체 이메일** 저장 금지. 이메일은 앞 2자 + *** 등 마스킹.
- 사용자 제어 입력은 `sanitizeForLog()`로 줄바꿈/탭 제거 및 길이 제한 후 기록.
- 보안 이벤트(재설정 성공, refresh 재사용, 로그인 실패 다수)는 별도 보안 로그 또는 플래그로 남깁니다.

```javascript
// utils/logger.js 보강
function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  return local.slice(0, 2) + '***@' + domain;
}
// 모든 user/email 필드는 maskEmail 적용 후 로깅
```

---

## 10. React Native Security Improvements

- **토큰 저장:** AsyncStorage 사용 금지. `expo-secure-store` 또는 `react-native-keychain` 사용. 가능하면 biometric으로 잠금.
- **API URL:** 하드코딩 금지. 빌드 시 `ENVFILE` 또는 `app.config.js`에서 `API_BASE_URL` 주입. 프로덕션/스테이징 분리.
- **인증서 고정:** 프로덕션 앱은 API 도메인에 대해 certificate pinning 적용 권장 (네트워크 중간자 공격 완화).

---

## 11. AWS EC2 Hardening Checklist

- SSH: 키 기반 인증만, root 로그인 비활성화, 필요 시 non-default port.
- 방화벽: 22(또는 SSH 포트), 80/443만 열고, DB/Redis는 내부 또는 보안 그룹 제한.
- OS: 자동 보안 업데이트, 불필요 서비스 제거, 파일 시스템 권한 최소화.
- Node: `NODE_ENV=production`, 프로세스 매니저(PM2 등), 역방향 프록시(Nginx)에서 TLS 종료, HSTS.
- 환경 변수: .env 파일 권한 600, 시크릿은 AWS Secrets Manager 또는 SSM Parameter Store 사용.
- 디스크: CSV/로그 디렉터리 권한 제한, 정기 로테이션 및 백업.
- 모니터링: 로그 집계, 실패 로그인/비밀번호 재설정 시도 알림.

---

## 12. Final Security Audit Checklist

- [ ] JWT_SECRET 기본값/fallback 없음, 길이 ≥ 32.
- [ ] Rate limit: 로그인/비밀번호 재설정/refresh 항상 적용.
- [ ] Body size 256KB 이하 (업로드 제외).
- [ ] CORS: 프로덕션 화이트리스트만.
- [ ] 비밀번호 재설정: DB 해시 토큰, 만료, 시도 제한, 동일 응답 메시지.
- [ ] Refresh: rotation, 재사용 시 전부 revoke, 해시 저장.
- [ ] 디바이스/허브/펫: 소유권 미들웨어로 일원화.
- [ ] CSV 경로: path.resolve + 기준 디렉터리 내부 검사.
- [ ] CSV/로그: injection 방지(이스케이프/마스킹).
- [ ] 에러 메시지: 인증/계정 관련 통일(열거 방지).
- [ ] 로깅: 비밀번호/토큰/전체 이메일 미기록.
- [ ] 디바이스 바인딩: 이미 다른 계정에 등록된 디바이스 재바인딩 불가.
- [ ] 모든 인증 필요 라우트에 verifyToken 적용 여부 점검.
- [ ] React Native: Secure Store, API URL 환경 분리, (선택) certificate pinning.
- [ ] AWS: 방화벽, SSH, TLS, 시크릿 관리, 로그 모니터링.

---

이 문서는 `backend/` 내 미들웨어·서비스·설정 변경과 함께 적용하세요.  
실제 코드는 `middlewares/pathSecurity.js`, `middlewares/deviceOwnership.js`, `utils/sanitize.js`, `services/refreshTokenService.js`, `services/passwordResetService.js` 등으로 프로젝트에 반영되어 있습니다.

### 적용 후 필수 사항

- **환경 변수:** `JWT_SECRET` 32자 이상 필수. 프로덕션에서 `ALLOWED_ORIGINS`, `BODY_LIMIT`, `PASSWORD_RESET_BASE_URL` 설정.
- **DB:** `PasswordResetTokens` 테이블 생성 — `npx sequelize-cli db:migrate` 또는 `sequelize.sync()` 실행.
- **앱:** 비밀번호 재설정은 `token` + `newPassword` 로 호출 (링크에서 토큰 전달). Refresh 토큰은 1회 사용 후 새로 발급된 값으로 교체.
