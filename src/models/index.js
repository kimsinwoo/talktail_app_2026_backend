const Sequelize = require('sequelize');
const config = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// 프로덕션 환경에서 필수 환경 변수 검증
if (env === 'production') {
  const required = ['DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE', 'DB_HOST', 'JWT_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging,
    timezone: dbConfig.timezone,
    pool: dbConfig.pool,
    dialectOptions: dbConfig.dialectOptions || {},
  }
);

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// 모델 로드
// 사용자 및 인증 관련
db.User = require('./User')(sequelize, Sequelize);

// 펫 관련
db.Pet = require('./Pet')(sequelize, Sequelize);
db.Record = require('./Record')(sequelize, Sequelize);

// 디바이스 및 허브 관련
db.Hub = require('./Hub')(sequelize, Sequelize);
db.Device = require('./Device')(sequelize, Sequelize);
db.MvsDevice = require('./MvsDevice')(sequelize, Sequelize);
db.Telemetry = require('./Telemetry')(sequelize, Sequelize);

// AI 분석 관련 (cream-off)
db.Image = require('./Image')(sequelize, Sequelize);
db.Paperweight = require('./Paperweight')(sequelize, Sequelize);
db.Debuging = require('./Debuging')(sequelize, Sequelize);

// 쿠폰 관련 (cream-off)
db.Coupon = require('./Coupon')(sequelize, Sequelize);
db.CouponRedemption = require('./CouponRedemption')(sequelize, Sequelize);

// 추적 관련 (cream-off)
db.Tracking = require('./Tracking')(sequelize, Sequelize);

// 결제 관련 (cream-off용, 쇼핑몰 기능 제거)
db.Payment = require('./Payment')(sequelize, Sequelize);

// 일기 관련
db.Diary = require('./Diary')(sequelize, Sequelize);

// 데일리 건강 체크
db.DailyCheck = require('./DailyCheck')(sequelize, Sequelize);

// OAuth 관련
db.OAuthAccount = require('./OAuthAccount')(sequelize, Sequelize);
db.RefreshToken = require('./RefreshToken')(sequelize, Sequelize);
db.PasswordResetToken = require('./PasswordResetToken')(sequelize, Sequelize);

// 관계 설정
Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

module.exports = db;
