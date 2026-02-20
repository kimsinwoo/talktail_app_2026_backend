module.exports = (sequelize, DataTypes) => {
  const CommunityPostLike = sequelize.define(
    'CommunityPostLike',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      postId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '게시글 ID',
      },
      userEmail: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '좋아요한 사용자 이메일',
      },
    },
    {
      tableName: 'CommunityPostLikes',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        {
          unique: true,
          fields: ['postId', 'userEmail'],
          name: 'unique_post_user_like',
        },
        {
          fields: ['postId'],
        },
        {
          fields: ['userEmail'],
        },
      ],
    }
  );

  CommunityPostLike.associate = (db) => {
    // User와의 관계
    CommunityPostLike.belongsTo(db.User, {
      foreignKey: 'userEmail',
      targetKey: 'email',
      as: 'User',
    });
    
    // 게시글 관계
    CommunityPostLike.belongsTo(db.CommunityPost, {
      foreignKey: 'postId',
      as: 'Post',
    });
  };

  return CommunityPostLike;
};

