# Sequelize 설정 가이드

이 백엔드는 **Sequelize ORM**을 사용하여 MySQL 데이터베이스와 통신합니다.

## 설치된 패키지

- `sequelize`: ^6.37.7
- `mysql2`: ^3.15.3

## 데이터베이스 설정

### 1. 환경 변수 설정

`.env` 파일에 다음 변수를 설정하세요:

```bash
# 데이터베이스 설정
DB_USERNAME=root
DB_PASSWORD=your_password
DB_DATABASE=talktail_db
DB_HOST=127.0.0.1
DB_PORT=3306
DB_LOGGING=false  # 개발 시 true로 설정하여 SQL 쿼리 로그 확인 가능
DB_SSL=false      # 프로덕션에서 SSL 사용 시 true
```

### 2. 데이터베이스 생성

MySQL에서 데이터베이스를 생성하세요:

```sql
CREATE DATABASE talktail_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Sequelize 설정 파일

설정 파일 위치: `backend/src/config/database.js`

환경별 설정:
- **development**: 개발 환경 (alter: true로 스키마 자동 변경)
- **test**: 테스트 환경
- **production**: 프로덕션 환경 (alter: false, 마이그레이션 사용 권장)

## 모델 구조

모든 모델은 `backend/src/models/` 디렉토리에 있습니다:

- `User.js` - 사용자
- `Pet.js` - 펫
- `Hub.js` - 허브
- `Device.js` - 디바이스
- `Telemetry.js` - 텔레메트리 데이터
- `Category.js` - 상품 카테고리
- `Product.js` - 상품
- `Vendor.js` - 업체
- `Order.js` - 주문
- `OrderItem.js` - 주문 항목
- `Payment.js` - 결제
- `Cart.js` - 장바구니
- `CartItem.js` - 장바구니 항목

## 사용 방법

### 모델 사용 예시

```javascript
const db = require('./models');

// 사용자 조회
const user = await db.User.findByPk('user@example.com');

// 펫 목록 조회
const pets = await db.Pet.findAll({
  where: {
    user_email: 'user@example.com'
  },
  include: [{
    model: db.Device,
    as: 'Device'
  }]
});

// 트랜잭션 사용
await db.sequelize.transaction(async (t) => {
  const order = await db.Order.create({
    orderNumber: 'ORD-123',
    user_email: 'user@example.com',
    // ...
  }, { transaction: t });
  
  await db.OrderItem.create({
    orderId: order.id,
    productId: 1,
    quantity: 2,
    // ...
  }, { transaction: t });
});
```

### 관계 (Associations)

모든 모델 간의 관계는 `models/index.js`에서 자동으로 설정됩니다:

```javascript
// User와 Pet 관계
db.User.hasMany(db.Pet, { foreignKey: 'user_email', as: 'Pets' });
db.Pet.belongsTo(db.User, { foreignKey: 'user_email', as: 'User' });

// Hub와 Device 관계
db.Hub.hasMany(db.Device, { foreignKey: 'hub_address', as: 'Devices' });
db.Device.belongsTo(db.Hub, { foreignKey: 'hub_address', as: 'Hub' });
```

## 데이터베이스 동기화

### 개발 환경

서버 시작 시 자동으로 `sync({ alter: true })`가 실행되어 스키마 변경사항이 자동 반영됩니다.

### 프로덕션 환경

프로덕션에서는 `sync({ alter: false })`를 사용하며, 마이그레이션 도구 사용을 권장합니다.

## 쿼리 최적화

### 인덱스

모든 모델에 적절한 인덱스가 설정되어 있습니다:

```javascript
// 예시: Telemetry 모델
indexes: [
  {
    fields: ['hub_address', 'device_address', 'timestamp'],
    name: 'idx_hub_device_time',
  },
  {
    fields: ['device_address', 'timestamp'],
    name: 'idx_device_time',
  },
]
```

### Connection Pool

환경별 Connection Pool 설정:

- **development**: max: 5, min: 0
- **production**: max: 20, min: 5

## 트랜잭션

데이터 일관성을 위해 중요한 작업은 트랜잭션으로 처리합니다:

```javascript
// 예시: 주문 생성 및 재고 차감
await db.sequelize.transaction(async (t) => {
  const order = await db.Order.create({...}, { transaction: t });
  await db.Product.decrement('stock', {
    by: quantity,
    where: { id: productId },
    transaction: t
  });
});
```

## 로깅

개발 환경에서 SQL 쿼리를 확인하려면:

```bash
DB_LOGGING=true npm run dev
```

## 문제 해결

### 연결 오류

1. MySQL 서버가 실행 중인지 확인
2. 데이터베이스가 생성되었는지 확인
3. 사용자 권한 확인
4. 방화벽 설정 확인

### 스키마 동기화 오류

- `alter: true` 사용 시 기존 데이터가 손실될 수 있으므로 주의
- 프로덕션에서는 마이그레이션 도구 사용 권장

### 성능 이슈

- Connection Pool 크기 조정
- 인덱스 최적화
- 쿼리 최적화 (N+1 문제 방지)

## 참고

- [Sequelize 공식 문서](https://sequelize.org/)
- [MySQL2 문서](https://github.com/sidorares/node-mysql2)
