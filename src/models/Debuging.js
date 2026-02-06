module.exports = (sequelize, DataTypes) => {
  const Debuging = sequelize.define(
    'Debuging',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      a1: {
        type: DataTypes.DECIMAL(30, 15),
        allowNull: true,
        comment: 'AI 분석 파라미터 1',
      },
      a2: {
        type: DataTypes.DECIMAL(30, 15),
        allowNull: true,
        comment: 'AI 분석 파라미터 2',
      },
      a3: {
        type: DataTypes.DECIMAL(30, 15),
        allowNull: true,
        comment: 'AI 분석 파라미터 3',
      },
      a4: {
        type: DataTypes.DECIMAL(30, 15),
        allowNull: true,
        comment: 'AI 분석 파라미터 4',
      },
      a5: {
        type: DataTypes.DECIMAL(30, 15),
        allowNull: true,
        comment: 'AI 분석 파라미터 5',
      },
      a6: {
        type: DataTypes.DECIMAL(30, 15),
        allowNull: true,
        comment: 'AI 분석 파라미터 6',
      },
      predictName: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '예측 이름',
      },
      diseaseName: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '질병 이름',
      },
      description: {
        type: DataTypes.STRING(1000),
        allowNull: true,
        comment: '설명',
      },
      confidence: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '신뢰도 (%)',
      },
      imagePath: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '이미지 경로',
      },
      createBy: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '생성자 이메일',
      },
      paperId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        comment: 'Paperweight ID',
      },
      imageId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        comment: 'Image ID',
      },
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        {
          fields: ['createBy'],
        },
        {
          fields: ['paperId'],
          unique: true,
        },
        {
          fields: ['imageId'],
          unique: true,
        },
      ],
    }
  );

  Debuging.associate = (db) => {
    Debuging.belongsTo(db.Paperweight, { foreignKey: 'paperId', as: 'Paperweight' });
    Debuging.belongsTo(db.User, {
      foreignKey: 'createBy',
      targetKey: 'email',
      as: 'User',
    });
    Debuging.belongsTo(db.Image, { foreignKey: 'imageId', as: 'Image' });
  };

  return Debuging;
};
