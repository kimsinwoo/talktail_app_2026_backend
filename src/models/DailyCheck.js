module.exports = (sequelize, DataTypes) => {
  const DailyCheck = sequelize.define(
    'DailyCheck',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      user_email: { type: DataTypes.STRING(100), allowNull: false },
      pet_code: { type: DataTypes.STRING(100), allowNull: false },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      meal: { type: DataTypes.STRING(20), allowNull: true },
      meal_detail: { type: DataTypes.STRING(50), allowNull: true, comment: '식사 상세 선택 (half_more, half, half_less, few_bites, smell_only, nothing)' },
      meal_note: { type: DataTypes.TEXT, allowNull: true, comment: '식사 관련 코멘트' },
      water: { type: DataTypes.STRING(20), allowNull: true },
      water_detail: { type: DataTypes.STRING(50), allowNull: true, comment: '음수량 상세 선택 (slightly_less, half, almost_none, slightly_more, noticeably_more, constantly_seeking)' },
      water_note: { type: DataTypes.TEXT, allowNull: true, comment: '음수량 관련 코멘트' },
      activity: { type: DataTypes.STRING(20), allowNull: true },
      activity_detail: { type: DataTypes.STRING(50), allowNull: true, comment: '활동량 상세 선택 (more_active, long_excited, restless, more_sensitive, less_play, mostly_resting, dull_response, clearly_different)' },
      activity_note: { type: DataTypes.TEXT, allowNull: true, comment: '활동량 관련 코멘트' },
      sleep: { type: DataTypes.STRING(20), allowNull: true },
      sleep_detail: { type: DataTypes.STRING(50), allowNull: true, comment: '수면 패턴 상세 선택 (woke_frequently, couldnt_rest_day, tried_stay_awake, sensitive, mostly_resting, chose_sleep, slower_response)' },
      sleep_note: { type: DataTypes.TEXT, allowNull: true, comment: '수면 패턴 관련 코멘트' },
      poop: { type: DataTypes.STRING(20), allowNull: true },
      poop_detail: { type: DataTypes.STRING(50), allowNull: true, comment: '배변 상태 상세 선택 (loose, hard, frequency_different, color_slightly, diarrhea, blood, no_poop, very_hard)' },
      poop_note: { type: DataTypes.TEXT, allowNull: true },
      special: { type: DataTypes.STRING(20), allowNull: true },
      special_note: { type: DataTypes.TEXT, allowNull: true },
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
