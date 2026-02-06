module.exports = (sequelize, DataTypes) => {
  const Tracking = sequelize.define(
    'Tracking',
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
      tracking: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '추적 정보',
      },
      userIp: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '사용자 IP',
      },
      bytes: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '바이트 수',
      },
      url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: 'URL',
      },
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        {
          fields: ['userId'],
        },
      ],
    }
  );

  Tracking.associate = (db) => {
    Tracking.belongsTo(db.User, {
      foreignKey: 'userId',
      targetKey: 'email',
      as: 'User',
    });
  };

  return Tracking;
};
