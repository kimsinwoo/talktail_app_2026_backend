module.exports = (sequelize, DataTypes) => {
  const Coupon = sequelize.define(
    'Coupon',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      code: {
        type: DataTypes.STRING(6),
        allowNull: false,
        unique: true,
        comment: '6자리 쿠폰 코드(숫자)',
      },
      tokens: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '지급 토큰 수',
      },
      endsAt: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '유효기간(이 시각 지나면 사용 불가)',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: false,
        comment: '활성화 여부',
      },
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        {
          fields: ['code'],
          unique: true,
        },
        {
          fields: ['isActive'],
        },
      ],
    }
  );

  Coupon.associate = (db) => {
    Coupon.hasMany(db.CouponRedemption, { foreignKey: 'couponId', as: 'Redemptions' });
  };

  return Coupon;
};
