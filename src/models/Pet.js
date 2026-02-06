module.exports = (sequelize, DataTypes) => {
  const Pet = sequelize.define(
    'Pet',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      pet_code: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: '펫 고유 코드',
      },
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          len: [1, 50],
        },
      },
      species: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          isIn: [['dog', 'cat', 'other']],
        },
        comment: '종류: dog, cat, other',
      },
      breed: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '품종',
      },
      weight: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: '체중 (kg)',
      },
      gender: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: {
          isIn: [['male', 'female', 'unknown', '수컷', '암컷']],
        },
        comment: '성별',
      },
      neutering: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: {
          isIn: [['yes', 'no', 'unknown', '여', '부']],
        },
        comment: '중성화 여부',
      },
      age: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '나이 (cream-off용)',
      },
      birthDate: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '생년월일',
      },
      admissionDate: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '입원일',
      },
      veterinarian: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '담당 수의사',
      },
      diagnosis: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '진단명',
      },
      medicalHistory: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '병력',
      },
      profile: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '프로필 이미지 URL (cream-off용)',
      },
      image: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '펫 이미지 URL',
      },
      user_email: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      device_address: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '연결된 디바이스 주소',
      },
      state: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: '입원중',
        comment: '상태: 입원중, 퇴원',
      },
      masterId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'cream-off용 masterId (User.id 참조)',
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
          fields: ['device_address'],
        },
        {
          fields: ['pet_code'],
          unique: true,
        },
        {
          fields: ['masterId'],
        },
      ],
    }
  );

  Pet.associate = (db) => {
    // User 관계
    Pet.belongsTo(db.User, { foreignKey: 'user_email', as: 'User' });
    
    // Device 관계
    Pet.belongsTo(db.Device, { foreignKey: 'device_address', as: 'Device' });
    
    // Diary 관계
    Pet.hasMany(db.Diary, {
      foreignKey: 'pet_code',
      sourceKey: 'pet_code',
      as: 'Diaries',
      constraints: false,
    });

    Pet.hasMany(db.DailyCheck, {
      foreignKey: 'pet_code',
      sourceKey: 'pet_code',
      as: 'DailyChecks',
      constraints: false,
    });
    
    // Record 관계 (cream-off용)
    Pet.hasMany(db.Record, {
      foreignKey: 'petId',
      as: 'Records',
    });
  };

  return Pet;
};
