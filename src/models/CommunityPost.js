module.exports = (sequelize, DataTypes) => {
  const CommunityPost = sequelize.define(
    'CommunityPost',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      boardType: {
        type: DataTypes.ENUM('notice', 'share', 'contest', 'qna', 'routine', 'pattern'),
        allowNull: false,
        comment: '게시판 타입',
      },
      category: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '카테고리 (산책, 식사, 음수 등)',
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        validate: {
          len: [1, 200],
        },
        comment: '게시글 제목',
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '게시글 내용',
      },
      authorEmail: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '작성자 이메일',
      },
      views: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: '조회수',
      },
      likes: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: '좋아요 수',
      },
      comments: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false,
        comment: '댓글 수',
      },
      isPinned: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: '공지사항 고정 여부',
      },
    },
    {
      tableName: 'CommunityPosts',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      indexes: [
        {
          fields: ['boardType'],
        },
        {
          fields: ['authorEmail'],
        },
        {
          fields: ['isPinned'],
        },
        {
          fields: ['createdAt'],
        },
        {
          fields: ['boardType', 'createdAt'],
        },
      ],
    }
  );

  CommunityPost.associate = (db) => {
    // User와의 관계
    CommunityPost.belongsTo(db.User, {
      foreignKey: 'authorEmail',
      targetKey: 'email',
      as: 'Author',
    });
    
    // 댓글 관계
    CommunityPost.hasMany(db.CommunityComment, {
      foreignKey: 'postId',
      as: 'Comments',
    });
    
    // 좋아요 관계
    CommunityPost.hasMany(db.CommunityPostLike, {
      foreignKey: 'postId',
      as: 'Likes',
    });
  };

  return CommunityPost;
};

