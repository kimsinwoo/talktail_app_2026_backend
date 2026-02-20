module.exports = (sequelize, DataTypes) => {
  const CommunityComment = sequelize.define(
    'CommunityComment',
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
      authorEmail: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '작성자 이메일',
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '댓글 내용',
      },
      likes: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: '좋아요 수',
      },
    },
    {
      tableName: 'CommunityComments',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        {
          fields: ['postId'],
        },
        {
          fields: ['authorEmail'],
        },
        {
          fields: ['createdAt'],
        },
      ],
    }
  );

  CommunityComment.associate = (db) => {
    // User와의 관계
    CommunityComment.belongsTo(db.User, {
      foreignKey: 'authorEmail',
      targetKey: 'email',
      as: 'Author',
    });
    
    // 게시글 관계
    CommunityComment.belongsTo(db.CommunityPost, {
      foreignKey: 'postId',
      as: 'Post',
    });
  };

  return CommunityComment;
};

