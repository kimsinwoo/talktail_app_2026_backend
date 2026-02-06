module.exports = (sequelize, DataTypes) => {
  const Device = sequelize.define(
    'Device',
    {
      address: {
        type: DataTypes.STRING(100),
        allowNull: false,
        primaryKey: true,
        comment: '디바이스 MAC 주소',
      },
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '디바이스 이름',
      },
      hub_address: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '연결된 허브 주소',
      },
      user_email: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '소유자 이메일',
      },
      status: {
        type: DataTypes.ENUM('online', 'offline', 'unknown'),
        defaultValue: 'unknown',
        allowNull: false,
        comment: '디바이스 상태',
      },
      lastSeenAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '마지막 접속 시간',
      },
      battery: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '배터리 잔량 (%)',
      },
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        {
          fields: ['hub_address'],
        },
        {
          fields: ['user_email'],
        },
        {
          fields: ['status'],
        },
      ],
    }
  );

  Device.associate = (db) => {
    Device.belongsTo(db.Hub, { foreignKey: 'hub_address', as: 'Hub' });
    Device.belongsTo(db.User, { foreignKey: 'user_email', as: 'User' });
    Device.hasOne(db.Pet, { foreignKey: 'device_address', as: 'Pet' });
    Device.hasMany(db.Telemetry, {
      foreignKey: 'device_address',
      targetKey: 'address',
      as: 'Telemetries',
    });
  };

  return Device;
};
