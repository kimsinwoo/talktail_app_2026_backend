/**
 * Password reset token stored in DB (hashed), with expiry and attempt limit.
 * Replaces in-memory passwordResetStore for production.
 */

module.exports = (sequelize, DataTypes) => {
  const PasswordResetToken = sequelize.define(
    'PasswordResetToken',
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
      tokenHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: 'SHA-256 해시된 리셋 토큰',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '만료 시간',
      },
      attemptCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: '검증 시도 횟수',
      },
      maxAttempts: {
        type: DataTypes.INTEGER,
        defaultValue: 5,
        allowNull: false,
        comment: '최대 시도 횟수',
      },
      usedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '성공적으로 사용된 시간',
      },
    },
    {
      tableName: 'PasswordResetTokens',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        { fields: ['userId'] },
        { fields: ['tokenHash'], unique: true },
        { fields: ['expiresAt'] },
      ],
    }
  );

  PasswordResetToken.associate = (db) => {
    PasswordResetToken.belongsTo(db.User, {
      foreignKey: 'userId',
      targetKey: 'email',
      as: 'User',
    });
  };

  return PasswordResetToken;
};
