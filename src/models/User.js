module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      email: {
        type: DataTypes.STRING(100),
        primaryKey: true,
        allowNull: false,
        validate: {
          isEmail: true,
        },
      },
      username: {
        type: DataTypes.STRING(50),
        allowNull: true,
        unique: true,
        comment: '로그인용 사용자 아이디 (이메일과 별도, 회원가입 시 설정)',
      },
      password: {
        type: DataTypes.STRING(255), // bcrypt 해시
        allowNull: true, // OAuth 사용자는 비밀번호가 없을 수 있음
      },
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          len: [1, 50],
        },
      },
      // 주소 정보
      postcode: {
        type: DataTypes.STRING(20),
        allowNull: true, // OAuth 사용자는 주소가 없을 수 있음
      },
      address: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      detail_address: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
          len: [10, 20],
        },
      },
      // OAuth 관련
      oauthId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '소셜 로그인 고유 ID',
      },
      oauthProvider: {
        type: DataTypes.ENUM('google', 'kakao', 'naver', 'apple'),
        allowNull: true,
        comment: 'OAuth 제공자',
      },
      profileImage: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '프로필 이미지 URL',
      },
      // 토큰 관련
      accessToken: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'AccessToken 저장 (JWT)',
      },
      accessTokenExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'AccessToken 만료 시간',
      },
      refreshToken: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '해싱된 refreshToken',
      },
      refreshTokenExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'refreshToken 만료 시간',
      },
      // AI 토큰 관련 (cream-off 기능)
      aiTokenCurrent: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: '현재 AI 토큰 수',
      },
      aiTokenInfinite: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: '무제한 AI 토큰 여부',
      },
      // 역할 및 권한
      role: {
        type: DataTypes.ENUM('user', 'admin', 'super_admin'),
        defaultValue: 'user',
        allowNull: false,
        comment: '사용자 역할 (vendor 제거)',
      },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'DELETED'),
        defaultValue: 'ACTIVE',
        allowNull: false,
        comment: '사용자 상태 (Soft Delete)',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: false,
        comment: '계정 활성화 여부 (기존 호환성)',
      },
      lastLoginAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      // 푸시 알림용 FCM 디바이스 토큰
      fcm_token: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'FCM 디바이스 토큰 (푸시 알림 수신용)',
      },
      // 항목별 마지막 푸시 알림 전송 시각 (2시간 쿨다운용)
      push_reminder_diary_sent_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '일기 미완료 알림 마지막 전송 시각',
      },
      push_reminder_daily_check_sent_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '상태 체크 미완료 알림 마지막 전송 시각',
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '삭제 시간 (Soft Delete)',
      },
    },
    {
      tableName: 'Users',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        {
          fields: ['email'],
          unique: true,
        },
        {
          fields: ['username'],
          unique: true,
        },
        {
          fields: ['role'],
        },
        {
          fields: ['isActive'],
        },
        {
          fields: ['oauthId', 'oauthProvider'],
        },
      ],
    }
  );

  User.associate = (db) => {
    // Hub 관계
    User.hasMany(db.Hub, { foreignKey: 'user_email', as: 'Hubs' });
    
      // Pet 관계
      User.hasMany(db.Pet, { foreignKey: 'user_email', as: 'Pets' });
      
      // 일기 관계
      User.hasMany(db.Diary, { foreignKey: 'user_email', as: 'Diaries' });
    
      // 결제 관계 (cream-off용 userId와 기존용 user_email 모두 지원)
      User.hasMany(db.Payment, {
        foreignKey: 'userId',
        targetKey: 'email',
        as: 'Payments',
      });
    
    // 쿠폰 사용 관계
    User.hasMany(db.CouponRedemption, { foreignKey: 'userId', as: 'CouponRedemptions' });
    
    // 디버깅 관계
    User.hasMany(db.Debuging, { foreignKey: 'createBy', as: 'Debugings' });
    
    // Paperweight 관계
    User.hasMany(db.Paperweight, { foreignKey: 'createdBy', as: 'Paperweights' });
    
      // Tracking 관계
      User.hasMany(db.Tracking, { foreignKey: 'userId', as: 'Trackings' });
      
      // Record 관계
      User.hasMany(db.Record, { foreignKey: 'userId', as: 'Records' });
      
      // OAuth 관계
      User.hasMany(db.OAuthAccount, {
        foreignKey: 'userId',
        targetKey: 'email',
        as: 'OAuthAccounts',
      });
      
      // RefreshToken 관계
      User.hasMany(db.RefreshToken, {
        foreignKey: 'userId',
        targetKey: 'email',
        as: 'RefreshTokens',
      });

    // PasswordResetToken 관계
      User.hasMany(db.PasswordResetToken, {
        foreignKey: 'userId',
        targetKey: 'email',
        as: 'PasswordResetTokens',
      });
  };

  return User;
};
