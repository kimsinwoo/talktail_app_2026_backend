module.exports = (sequelize, DataTypes) => {
  const Image = sequelize.define(
    'Image',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      cropedImage: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '크롭된 이미지 경로',
      },
      originalImage: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '원본 이미지 경로',
      },
      predictedClass: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '예측된 클래스',
      },
      confidence: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '신뢰도',
      },
      classIndex: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '클래스 인덱스',
      },
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
    }
  );

  Image.associate = (db) => {
    Image.hasOne(db.Debuging, { foreignKey: 'imageId', as: 'Debuging' });
    Image.hasMany(db.Paperweight, { foreignKey: 'imageId', as: 'Paperweights' });
  };

  return Image;
};
