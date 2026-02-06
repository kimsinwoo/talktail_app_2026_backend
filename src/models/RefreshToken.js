module.exports = (sequelize, DataTypes) => {
  const RefreshToken = sequelize.define(
    'RefreshToken',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '사용자 이메일',
      },
      token: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '암호화된 refresh token',
      },
      tokenHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: '토큰 해시 (재사용 감지용)',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '만료 시간',
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '폐기 시간',
      },
      replacedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: '이 토큰을 대체한 새 토큰 ID (Rotation 추적)',
      },
      userAgent: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '요청 User-Agent',
      },
      ipAddress: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '요청 IP 주소',
      },
    },
    {
      tableName: 'RefreshTokens',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        {
          fields: ['userId'],
        },
        {
          fields: ['tokenHash'],
          unique: true,
        },
        {
          fields: ['expiresAt'],
        },
        {
          fields: ['revokedAt'],
        },
      ],
    }
  );

  RefreshToken.associate = (db) => {
    RefreshToken.belongsTo(db.User, {
      foreignKey: 'userId',
      targetKey: 'email',
      as: 'User',
    });
    RefreshToken.belongsTo(db.RefreshToken, {
      foreignKey: 'replacedBy',
      as: 'ReplacedByToken',
    });
  };

  return RefreshToken;
};
