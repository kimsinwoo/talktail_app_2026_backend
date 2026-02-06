module.exports = (sequelize, DataTypes) => {
  const CouponRedemption = sequelize.define(
    'CouponRedemption',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '사용자 이메일',
      },
      couponId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '쿠폰 ID',
      },
      redeemedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
        comment: '사용 시각',
      },
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        {
          fields: ['userId', 'couponId'],
          unique: true,
          name: 'unique_user_coupon',
        },
        {
          fields: ['userId'],
        },
        {
          fields: ['couponId'],
        },
      ],
    }
  );

  CouponRedemption.associate = (db) => {
    CouponRedemption.belongsTo(db.User, {
      foreignKey: 'userId',
      targetKey: 'email',
      as: 'User',
    });
    CouponRedemption.belongsTo(db.Coupon, { foreignKey: 'couponId', as: 'Coupon' });
  };

  return CouponRedemption;
};
