module.exports = (sequelize, DataTypes) => {
  const OAuthAccount = sequelize.define(
    'OAuthAccount',
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
      provider: {
        type: DataTypes.ENUM('google', 'kakao', 'naver', 'apple'),
        allowNull: false,
        comment: 'OAuth 제공자',
      },
      providerId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Provider에서 제공하는 고유 ID',
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Provider에서 제공하는 이메일 (optional)',
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Provider에서 제공하는 이름',
      },
      profileImage: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '프로필 이미지 URL',
      },
      // OAuth 토큰은 저장하지 않음 (보안)
      // access_token, id_token은 서버에서만 사용하고 저장하지 않음
    },
    {
      tableName: 'OAuthAccounts',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        {
          fields: ['userId'],
        },
        {
          fields: ['provider', 'providerId'],
          unique: true,
          name: 'unique_provider_providerId',
        },
        {
          fields: ['provider'],
        },
      ],
    }
  );

  OAuthAccount.associate = (db) => {
    OAuthAccount.belongsTo(db.User, {
      foreignKey: 'userId',
      targetKey: 'email',
      as: 'User',
    });
  };

  return OAuthAccount;
};
