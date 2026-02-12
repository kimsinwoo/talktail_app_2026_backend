module.exports = (sequelize, DataTypes) => {
  const Diary = sequelize.define(
    'Diary',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      user_email: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '작성자 이메일 (User와 연결)',
      },
      pet_code: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '펫 코드 (Pet과 연결)',
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: '일기 작성 날짜',
      },
      title: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          len: [1, 100],
        },
        comment: '일기 제목',
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '일기 내용',
      },
      mood: {
        type: DataTypes.ENUM('happy', 'neutral', 'sad'),
        allowNull: false,
        comment: '반려동물의 기분',
      },
      weather: {
        type: DataTypes.ENUM('sunny', 'cloudy', 'rainy'),
        allowNull: false,
        comment: '날씨',
      },
      activities: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: '활동 목록 (배열)',
      },
      photos: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: '사진 URL 목록 (배열)',
      },
      //오늘의 체크포인트
      checkpoints: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: '체크포인트 목록 (배열) - [{id, label, checked}]',
      },
    },
    {
      tableName: 'Diaries',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        {
          fields: ['user_email'],
        },
        {
          fields: ['pet_code'],
        },
        {
          fields: ['date'],
        },
        {
          fields: ['user_email', 'pet_code'],
        },
        {
          fields: ['user_email', 'date'],
        },
        {
          fields: ['pet_code', 'date'],
        },
      ],
    }
  );

  Diary.associate = (db) => {
    // User와의 관계 (작성자)
    Diary.belongsTo(db.User, {
      foreignKey: 'user_email',
      targetKey: 'email',
      as: 'User',
    });

    // Pet과의 관계 (pet_code는 unique key이므로 constraints를 false로 설정)
    Diary.belongsTo(db.Pet, {
      foreignKey: 'pet_code',
      targetKey: 'pet_code',
      as: 'Pet',
      constraints: false, // 외래 키 제약 조건을 수동으로 관리
    });
  };

  return Diary;
};
