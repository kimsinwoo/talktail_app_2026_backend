'use strict';

module.exports = (sequelize, DataTypes) => {
  const MvsDevice = sequelize.define(
    'MvsDevice',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      macAddress: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        field: 'mac_address',
      },
      hubId: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: 'hub_id',
      },
      MVS: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      length: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      firstTime: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'first_time',
      },
    },
    {
      tableName: 'mvs_devices',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [{ fields: ['hub_id'] }],
    }
  );

  return MvsDevice;
};
