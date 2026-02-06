module.exports = (sequelize, DataTypes) => {
  const Payment = sequelize.define(
    'Payment',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '사용자 이메일 (cream-off용)',
      },
      orderId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '주문 ID (cream-off용, 문자열)',
      },
      paymentMethod: {
        type: DataTypes.ENUM('card', 'bank_transfer', 'virtual_account', 'mobile', 'paypal'),
        allowNull: true,
        comment: '결제 방법 (cream-off용)',
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: {
          min: 0,
        },
      },
      status: {
        type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled', 'refunded', 'created', 'used'),
        defaultValue: 'pending',
        allowNull: false,
        comment: '결제 상태 (기존 + cream-off, 중복 ENUM 값 제거)',
      },
      transactionId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        unique: true,
        comment: '결제 대행사 거래 ID',
      },
      provider: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '결제 대행사 (iamport, toss 등)',
      },
      paidAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      refundedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      refundAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      refundReason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '결제 관련 추가 정보',
      },
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        {
          fields: ['orderId'],
        },
        {
          fields: ['userId'],
        },
        {
          fields: ['transactionId'],
          unique: true,
        },
        {
          fields: ['status'],
        },
        {
          fields: ['paidAt'],
        },
      ],
    }
  );

  Payment.associate = (db) => {
    Payment.belongsTo(db.User, {
      foreignKey: 'userId',
      targetKey: 'email',
      as: 'User',
    });
    // Order 관계 제거 (쇼핑몰 기능 제거)
  };

  return Payment;
};
