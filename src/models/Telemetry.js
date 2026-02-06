module.exports = (sequelize, DataTypes) => {
  const Telemetry = sequelize.define(
    'Telemetry',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      hub_address: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '허브 MAC 주소',
      },
      device_address: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '디바이스 MAC 주소',
      },
      timestamp: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: '샘플 타임스탬프 (허브가 처리한 시각)',
      },
      starttime: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: '측정 시작 시각',
      },
      ir: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'IR 센서 값',
      },
      red: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Red 센서 값',
      },
      green: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Green 센서 값',
      },
      spo2: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        comment: '산소포화도 (%)',
      },
      hr: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '심박수 (bpm)',
      },
      temp: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        comment: '체온 (°C)',
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
          fields: ['hub_address', 'device_address', 'timestamp'],
          name: 'idx_hub_device_time',
        },
        {
          fields: ['device_address', 'timestamp'],
          name: 'idx_device_time',
        },
        {
          fields: ['timestamp'],
          name: 'idx_timestamp',
        },
      ],
    }
  );

  Telemetry.associate = (db) => {
    Telemetry.belongsTo(db.Hub, {
      foreignKey: 'hub_address',
      targetKey: 'address',
      as: 'Hub',
    });
    Telemetry.belongsTo(db.Device, {
      foreignKey: 'device_address',
      targetKey: 'address',
      as: 'Device',
    });
  };

  return Telemetry;
};
