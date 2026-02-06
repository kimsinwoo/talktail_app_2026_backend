module.exports = (sequelize, DataTypes) => {
  const Record = sequelize.define(
    'Record',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '사용자 이메일',
      },
      petId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '펫 ID',
      },
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        {
          fields: ['userId'],
        },
        {
          fields: ['petId'],
        },
      ],
    }
  );

  Record.associate = (db) => {
    Record.belongsTo(db.User, {
      foreignKey: 'userId',
      targetKey: 'email',
      as: 'User',
    });
    Record.belongsTo(db.Pet, { foreignKey: 'petId', as: 'Pet' });
  };

  return Record;
};
