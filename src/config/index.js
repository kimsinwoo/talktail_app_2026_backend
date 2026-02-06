require('dotenv').config();

module.exports = {
  // 서버 설정
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    host: process.env.HOST || '0.0.0.0',
  },

  // JWT 설정
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m', // Access Token: 15분
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d', // Refresh Token: 30일
  },

  // 보안 설정
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15분
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // 15분당 100회
    corsOrigin: process.env.CORS_ORIGIN || '*',
    allowedOrigins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000', 'http://localhost:5173'],
  },

  // MQTT 설정 (hub/+/data 구독 → 일별 CSV 저장)
  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1:1883',
    username: process.env.MQTT_USERNAME || '',
    password: process.env.MQTT_PASSWORD || '',
    csvDir: process.env.MQTT_CSV_DIR || './data/csv',
  },

  // 파일 업로드 설정
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    uploadDir: process.env.UPLOAD_DIR || './uploads',
  },

  // 이메일 설정 (선택사항)
  email: {
    enabled: process.env.EMAIL_ENABLED === 'true',
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    from: process.env.EMAIL_FROM || 'noreply@talktail.com',
  },

  // 결제 설정 (선택사항)
  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'none', // 'iamport', 'toss', 'none'
    apiKey: process.env.PAYMENT_API_KEY,
    secretKey: process.env.PAYMENT_SECRET_KEY,
  },

  // FCM 푸시 알림 (일기/상태체크 리마인더)
  fcm: {
    enabled: process.env.FCM_ENABLED === 'true',
    // 서비스 계정 JSON 파일 경로 또는 비워두면 GOOGLE_APPLICATION_CREDENTIALS 사용
    credentialPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FCM_CREDENTIAL_PATH || '',
    // 리마인더 알림 쿨다운(밀리초). 기본 2시간
    reminderCooldownMs: parseInt(process.env.PUSH_REMINDER_COOLDOWN_MS || '7200000', 10),
  },
};
