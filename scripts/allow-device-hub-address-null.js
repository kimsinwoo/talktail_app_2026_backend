/**
 * Devices 테이블의 hub_address 컬럼을 NULL 허용으로 변경 (BLE 1:N 직접 연결용)
 * 실행: node scripts/allow-device-hub-address-null.js (backend 폴더에서 실행)
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const db = require('../src/models');

async function main() {
  try {
    await db.sequelize.authenticate();
    console.log('DB 연결됨:', db.sequelize.config.database);
  } catch (err) {
    console.error('DB 연결 실패:', err.message);
    process.exit(1);
  }

  try {
    await db.sequelize.query(
      `ALTER TABLE Devices MODIFY COLUMN hub_address VARCHAR(100) NULL COMMENT '연결된 허브 주소 (null이면 BLE 1:N 직접 연결)'`
    );
    console.log('hub_address 컬럼이 NULL 허용으로 변경되었습니다.');
  } catch (err) {
    console.error('ALTER 실패:', err.message);
    process.exit(1);
  }

  await db.sequelize.close();
  console.log('완료.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
