// 전역 에러 핸들러를 가장 먼저 설정
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  process.exit(1);
});

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// 환경 변수 검증
const validateEnv = require('./utils/validateEnv');
try {
  validateEnv();
} catch (error) {
  console.error('❌ Environment validation failed:', error.message);
  process.exit(1);
}

let logger;
try {
  logger = require('./utils/logger');
} catch (error) {
  console.error('❌ Failed to load logger:', error);
  process.exit(1);
}

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const fs = require('fs');
const { Server } = require('socket.io');

let db;
try {
  db = require('./models');
} catch (error) {
  logger.error('❌ Failed to load models:', error);
  logger.error('Error stack:', error.stack);
  process.exit(1);
}

let config;
try {
  config = require('./config');
} catch (error) {
  logger.error('❌ Failed to load config:', error);
  logger.error('Error stack:', error.stack);
  process.exit(1);
}

const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const { apiLimiter } = require('./middlewares/rateLimiter');

// 환경 변수 검증
if (!config.jwt.secret || config.jwt.secret === 'your-secret-key-change-in-production') {
  if (config.server.env === 'production') {
    logger.error('❌ CRITICAL: JWT_SECRET must be set in production!');
    process.exit(1);
  } else {
    logger.warn('⚠️  WARNING: JWT_SECRET is using default value. Set a strong secret in production!');
  }
}

const app = express();
const server = http.createServer(app);

// Socket.IO 초기화
const io = new Server(server, {
  cors: {
    origin: config.security.allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  },
});

// 보안 미들웨어
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS 설정
app.use(cors({
  origin: (origin, callback) => {
    // 개발 환경에서는 모든 origin 허용
    if (config.server.env === 'development') {
      return callback(null, true);
    }
    // 프로덕션에서는 허용된 origin만
    if (!origin || config.security.allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));

// Body 파서
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// gzip 압축 (JSON 응답 크기 감소)
app.use(compression());

// Rate Limiting
app.use('/api', apiLimiter);

const isDev = config.server.env !== 'production';
// 요청 로깅 (헬스체크 제외, 프로덕션에서는 경로만)
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  logger.info(`${req.method} ${req.path}`, isDev ? { ip: req.ip } : {});
  next();
});

// POST/PUT/PATCH 본문 로깅 (개발 전용, 비밀번호 마스킹, 길이 제한)
app.use((req, res, next) => {
  if (!isDev) return next();
  const method = req.method.toUpperCase();
  if (['POST', 'PUT', 'PATCH'].includes(method) && req.body && Object.keys(req.body).length > 0) {
    const maskKeys = ['password', 'org_pw', 'currentPassword', 'newPassword', 'token', 'fcm_token'];
    const safe = {};
    for (const [k, v] of Object.entries(req.body)) {
      const keyLower = k.toLowerCase();
      safe[k] = maskKeys.some((mk) => keyLower.includes(mk.toLowerCase())) ? '***' : v;
    }
    const bodyStr = JSON.stringify(safe);
    const truncated = bodyStr.length > 400 ? bodyStr.slice(0, 400) + '...' : bodyStr;
    logger.info(`[Body] ${method} ${req.path}`, { len: bodyStr.length, body: truncated });
  }
  next();
});

// Socket.IO 인스턴스를 app에 저장
app.set('io', io);

// 헬스체크
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API 라우트
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth', require('./routes/auth.oauth')); // OAuth 라우트
app.use('/api/users', require('./routes/users')); // 사용자 관리 라우트
app.use('/api/org', require('./routes/org')); // 사용자 프로필(마이페이지)
app.use('/api/pets', require('./routes/pets'));
app.use('/api/hub', require('./routes/hub'));
app.use('/api/device', require('./routes/device'));
app.use('/api/telemetry', require('./routes/telemetry'));
app.use('/api/csv', require('./routes/csv'));
app.use('/api/daily-check', require('./routes/dailyCheck'));
app.use('/api/diaries', require('./routes/diaries'));
app.use('/api/home', require('./routes/home'));

// MQTT 서비스 초기화: hub_project/back 쪽 MQTT 서비스·TelemetryWorker 가져와서 사용
let mqttService = null;
let telemetryWorker = null;
// npm run dev 시 hub/+/send → CSV 저장 (자동 기동)
let mqttCsvSaveRunner = null;

try {
  const hubBackPath = path.resolve(__dirname, '../../hub_project/back');
  const MQTTService = require(path.join(hubBackPath, 'mqtt/service'));
  const TelemetryWorker = require(path.join(hubBackPath, 'workers/telemetryWorker'));

  const telemetryQueue = [];
  app.set('telemetryQueue', telemetryQueue);

  telemetryWorker = new TelemetryWorker(io, telemetryQueue, {
    batchSize: 100,
    processInterval: 50,
    broadcastInterval: 1000,
    minBroadcastInterval: 500,
  });
  mqttService = new MQTTService(io, telemetryQueue);
  mqttService.initialize();

  app.set('mqtt', mqttService);
  app.set('telemetryWorker', telemetryWorker);
  if (io) {
    io.mqttService = mqttService;
    io.telemetryWorker = telemetryWorker;
  }
  logger.info('MQTT Service initialized (hub_project/back): hub/+/telemetry, hub/+/send 등');
} catch (error) {
  logger.warn('MQTT Service not available:', error.message);
}

// Socket.IO 핸들러
const socketHandler = require('./socket');
socketHandler(io);

// FCM 푸시 알림 초기화 및 리마인더 스케줄 (일기/상태체크 미완료 시 2시간마다)
try {
  const pushService = require('./services/pushService');
  const pushReminderJob = require('./jobs/pushReminderJob');
  const cron = require('node-cron');
  pushService.init(config);
  // 매 2시간마다 실행 (0시, 2시, 4시, ...)
  cron.schedule('0 */2 * * *', () => {
    pushReminderJob.run().catch((err) => {
      if (logger) logger.error('[PushReminder] Cron error:', err);
    });
  });
  logger.info('Push reminder cron registered (every 2 hours)');
} catch (err) {
  logger.warn('Push reminder not started:', err.message);
}

// 404 핸들러
app.use(notFoundHandler);

// 에러 핸들러
app.use(errorHandler);

// 데이터베이스 연결 및 서버 시작
const PORT = config.server.port;
const HOST = config.server.host;

// Sequelize를 사용한 데이터베이스 연결
db.sequelize
  .authenticate()
  .then(() => {
    logger.info('✅ Database connection established (Sequelize)');
    
    // 데이터베이스 동기화
    // 개발 환경: alter: true (스키마 변경 반영)
    // 프로덕션: alter: false (마이그레이션 사용 권장)
    const syncOptions = {
      alter: config.server.env !== 'production',
      force: false, // 절대 true로 설정할시 데이터 삭제
    };
    
    return db.sequelize.sync(syncOptions);
  })
  .then(() => {
    logger.info('✅ Database synchronized (Sequelize)');
    
    // 서버 시작
    server.listen(PORT, HOST, () => {
      logger.info(`🚀 Server is running on ${HOST}:${PORT}`);
      logger.info(`📡 Socket.IO is ready`);
      logger.info(`🔒 Security: ${config.server.env === 'production' ? 'ENABLED' : 'DEVELOPMENT MODE'}`);
      logger.info(`📊 Environment: ${config.server.env}`);
      logger.info(`🗄️  Database: Sequelize with MySQL`);
      
      if (telemetryWorker) {
        telemetryWorker.start();
        logger.info('Telemetry Worker started');
      }
      if (mqttService) {
        setTimeout(() => {
          if (typeof mqttService.isConnected === 'function' && mqttService.isConnected()) {
            logger.info('✅ MQTT Client connected');
          } else {
            logger.warn('⚠️  MQTT Client not connected yet');
          }
        }, 1000);
      }
      // hub/+/send → backend/data/csv 자동 저장 + disconnected:mac 수신 시 디바이스 조회·FCM·상태 업데이트
      try {
        const mqttCsvSave = require('./scripts/mqttCsvSave');
        const deviceDisconnectedService = require('./services/deviceDisconnectedService');
        mqttCsvSaveRunner = mqttCsvSave.run({
          onDisconnected: async (macAddress) => {
            try {
              await deviceDisconnectedService.handleDisconnected(macAddress, io);
            } catch (e) {
              logger.error('[disconnected] 처리 오류:', e.message);
            }
          },
        });
        logger.info('✅ MQTT CSV Save started (hub/+/send → data/csv, disconnected 알림)');
      } catch (err) {
        logger.warn('MQTT CSV Save not started:', err.message);
      }
    });
  })
  .catch((err) => {
    const dbConfig = require('./config/database')[process.env.NODE_ENV || 'development'];

    logger.error('❌ Unable to start server:', err);
    logger.error('Database connection error:', err.message);
    logger.error('Error stack:', err.stack);
    logger.error('Database config:', {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      username: dbConfig.username,
      password: dbConfig.password ? '***' : '(empty)',
    });

    // NODE_ENV=production이면 logger가 콘솔에 안 나오므로 터미널에도 출력
    console.error('❌ Unable to start server:', err.message);
    console.error('Database:', dbConfig.database, '@', dbConfig.host + ':' + dbConfig.port);
    if (err.name === 'SequelizeConnectionError' || err.name === 'SequelizeConnectionRefusedError') {
      console.error('💡 MySQL 서버가 실행 중인지 확인하세요.');
      console.error('💡 데이터베이스가 존재하는지 확인하세요:', dbConfig.database);
    } else if (err.name === 'SequelizeAccessDeniedError') {
      console.error('💡 DB 사용자명/비밀번호를 확인하세요.');
    } else if (err.name === 'SequelizeDatabaseError') {
      console.error('💡 데이터베이스를 생성하거나 이름을 확인하세요.');
    }

    process.exit(1);
  });

// 전역 에러 핸들러는 이미 위에서 설정됨

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    if (telemetryWorker && typeof telemetryWorker.stop === 'function') {
      telemetryWorker.stop();
    }
    if (mqttService && typeof mqttService.shutdown === 'function') {
      mqttService.shutdown();
    }
    if (mqttCsvSaveRunner && typeof mqttCsvSaveRunner.stop === 'function') {
      mqttCsvSaveRunner.stop();
      logger.info('MQTT CSV Save stopped');
    }
    db.sequelize.close().then(() => {
      logger.info('Database connection closed');
      process.exit(0);
    });
  });
});

module.exports = { app, server, io };
