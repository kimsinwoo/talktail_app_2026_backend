/**
 * Devices 테이블에 lastDisconnectedAt 컬럼 추가 (disconnected 푸시 5분 쿨다운용)
 * 실행: node scripts/add-device-last-disconnected.js (backend 폴더에서 실행)
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const db = require('../src/models');

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

  const tableName = 'Devices';
  const columnName = 'lastDisconnectedAt';
  const exists = await hasColumn(tableName, columnName);
  if (exists) {
    console.log('컬럼 이미 존재:', columnName);
  } else {
    try {
      await db.sequelize.query(
        `ALTER TABLE ${tableName} ADD COLUMN lastDisconnectedAt DATETIME NULL COMMENT '마지막 디바이스 연결 해제 시각 (5분 쿨다운용)'`
      );
      console.log('컬럼 추가됨:', columnName);
    } catch (err) {
      console.error('컬럼 추가 실패:', err.message);
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
