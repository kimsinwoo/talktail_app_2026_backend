module.exports = (sequelize, DataTypes) => {
  const Hub = sequelize.define(
    'Hub',
    {
      address: {
        type: DataTypes.STRING(100),
        allowNull: false,
        primaryKey: true,
        comment: '허브 MAC 주소',
      },
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '허브 이름',
      },
      user_email: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '소유자 이메일',
      },
      is_change: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '변경 여부',
      },
      status: {
        type: DataTypes.ENUM('online', 'offline', 'unknown'),
        defaultValue: 'unknown',
        allowNull: false,
        comment: '허브 상태',
      },
      lastSeenAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '마지막 접속 시간',
      },
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        {
          fields: ['user_email'],
        },
        {
          fields: ['status'],
        },
      ],
    }
  );

  Hub.associate = (db) => {
    Hub.belongsTo(db.User, { foreignKey: 'user_email', as: 'User' });
    Hub.hasMany(db.Device, { foreignKey: 'hub_address', as: 'Devices' });
    Hub.hasMany(db.Telemetry, {
      foreignKey: 'hub_address',
      targetKey: 'address',
      as: 'Telemetries',
    });
  };

  return Hub;
};
