module.exports = (sequelize, DataTypes) => {
  const Paperweight = sequelize.define(
    'Paperweight',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      createdBy: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '생성자 이메일',
      },
      PetName: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '펫 이름',
      },
      breed: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '품종',
      },
      Weight: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: '체중',
      },
      customBreed: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '커스텀 품종',
      },
      itchiness: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '가려움 정도',
      },
      smell: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        comment: '냄새 여부',
      },
      alopecia: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        comment: '탈모 여부',
      },
      birthday: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '생년월일',
      },
      lesionSites: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '병변 부위',
      },
      imageId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '이미지 ID',
      },
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        {
          fields: ['createdBy'],
        },
        {
          fields: ['imageId'],
        },
      ],
    }
  );

  Paperweight.associate = (db) => {
    // createdBy는 User.id (INTEGER) 또는 User.email (STRING)일 수 있음
    // cream-off에서는 User.id를 사용하므로, 관계를 유연하게 설정
    Paperweight.belongsTo(db.User, {
      foreignKey: 'createdBy',
      targetKey: 'email',
      as: 'User',
      constraints: false, // 외래 키 제약 조건을 수동으로 관리
    });
    Paperweight.belongsTo(db.Image, { foreignKey: 'imageId', as: 'Image' });
    Paperweight.hasOne(db.Debuging, { foreignKey: 'paperId', as: 'Debuging' });
  };

  return Paperweight;
};
