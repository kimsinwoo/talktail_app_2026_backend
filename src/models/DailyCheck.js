module.exports = (sequelize, DataTypes) => {
  const DailyCheck = sequelize.define(
    'DailyCheck',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      user_email: { type: DataTypes.STRING(100), allowNull: false },
      pet_code: { type: DataTypes.STRING(100), allowNull: false },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      meal: { type: DataTypes.STRING(20), allowNull: true },
      water: { type: DataTypes.STRING(20), allowNull: true },
      activity: { type: DataTypes.STRING(20), allowNull: true },
      sleep: { type: DataTypes.STRING(20), allowNull: true },
      poop: { type: DataTypes.STRING(20), allowNull: true },
      special: { type: DataTypes.STRING(20), allowNull: true },
      special_note: { type: DataTypes.TEXT, allowNull: true },
      poop_note: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'DailyChecks',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        { fields: ['user_email'] },
        { fields: ['pet_code'] },
        { fields: ['date'] },
        { unique: true, fields: ['pet_code', 'date'] },
      ],
    }
  );
  DailyCheck.associate = (db) => {
    DailyCheck.belongsTo(db.User, { foreignKey: 'user_email', targetKey: 'email', as: 'User' });
    DailyCheck.belongsTo(db.Pet, { foreignKey: 'pet_code', targetKey: 'pet_code', as: 'Pet', constraints: false });
  };
  return DailyCheck;
};
