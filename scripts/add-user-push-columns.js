/**
 * Users 테이블에 푸시 알림용 컬럼 추가 (fcm_token, push_reminder_*)
 * 실행: node scripts/add-user-push-columns.js
 * (backend 폴더에서 실행)
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const db = require('../src/models');

const COLUMNS = [
  { name: 'fcm_token', sql: "ADD COLUMN fcm_token TEXT NULL COMMENT 'FCM 디바이스 토큰 (푸시 알림 수신용)'" },
  { name: 'push_reminder_diary_sent_at', sql: "ADD COLUMN push_reminder_diary_sent_at DATETIME NULL COMMENT '일기 미완료 알림 마지막 전송 시각'" },
  { name: 'push_reminder_daily_check_sent_at', sql: "ADD COLUMN push_reminder_daily_check_sent_at DATETIME NULL COMMENT '상태 체크 미완료 알림 마지막 전송 시각'" },
];

async function hasColumn(tableName, columnName) {
  const [rows] = await db.sequelize.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    { replacements: [db.sequelize.config.database, tableName, columnName] }
  );
  return rows.length > 0;
}

async function main() {
  try {
    await db.sequelize.authenticate();
    console.log('DB 연결됨:', db.sequelize.config.database);
  } catch (err) {
    console.error('DB 연결 실패:', err.message);
    process.exit(1);
  }

  const tableName = 'Users';
  for (const col of COLUMNS) {
    const exists = await hasColumn(tableName, col.name);
    if (exists) {
      console.log('컬럼 이미 존재:', col.name);
      continue;
    }
    try {
      await db.sequelize.query(`ALTER TABLE ${tableName} ${col.sql}`);
      console.log('컬럼 추가됨:', col.name);
    } catch (err) {
      console.error('컬럼 추가 실패:', col.name, err.message);
    }
  }

  await db.sequelize.close();
  console.log('완료.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
