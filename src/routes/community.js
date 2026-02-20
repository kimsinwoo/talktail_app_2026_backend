const express = require('express');
const { verifyToken } = require('../middlewares/auth');
const { AppError } = require('../middlewares/errorHandler');
const db = require('../models');

const router = express.Router();
router.use(verifyToken);

// 게시글 목록 조회
router.get('/posts', async (req, res, next) => {
  try {
    const { boardType, page = 1, limit = 50 } = req.query;
    
    if (!boardType) {
      throw new AppError('boardType 파라미터가 필요합니다', 400);
    }

    const validBoardTypes = ['notice', 'share', 'contest', 'qna', 'routine', 'pattern'];
    if (!validBoardTypes.includes(boardType)) {
      throw new AppError('유효하지 않은 boardType입니다', 400);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = { boardType };

    // 공지사항은 고정 게시글 먼저, 나머지는 최신순
    const order = boardType === 'notice' 
      ? [['isPinned', 'DESC'], ['createdAt', 'DESC']]
      : [['createdAt', 'DESC']];

    const { count, rows } = await db.CommunityPost.findAndCountAll({
      where,
      order,
      limit: parseInt(limit),
      offset,
      include: [
        {
          model: db.User,
          as: 'Author',
          attributes: ['email', 'name'],
          required: false,
        },
      ],
    });

    const posts = rows.map(post => ({
      id: post.id,
      boardType: post.boardType,
      category: post.category,
      title: post.title,
      content: post.content,
      author: post.Author?.name || post.authorEmail,
      authorEmail: post.authorEmail,
      date: post.createdAt.toISOString().slice(0, 10),
      views: post.views,
      likes: post.likes,
      comments: post.comments,
      isPinned: post.isPinned,
    }));

    res.json({
      success: true,
      data: {
        list: posts,
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (e) {
    next(e);
  }
});

// 게시글 상세 조회
router.get('/posts/:id', async (req, res, next) => {
  try {
    const postId = parseInt(req.params.id, 10);
    if (Number.isNaN(postId)) {
      throw new AppError('유효하지 않은 게시글 ID입니다', 400);
    }

    const post = await db.CommunityPost.findByPk(postId, {
      include: [
        {
          model: db.User,
          as: 'Author',
          attributes: ['email', 'name'],
          required: false,
        },
      ],
    });

    if (!post) {
      throw new AppError('게시글을 찾을 수 없습니다', 404);
    }

    // 조회수 증가
    await post.update({ views: post.views + 1 });

    res.json({
      success: true,
      data: {
        id: post.id,
        boardType: post.boardType,
        category: post.category,
        title: post.title,
        content: post.content,
        author: post.Author?.name || post.authorEmail,
        authorEmail: post.authorEmail,
        date: post.createdAt.toISOString().slice(0, 10),
        views: post.views + 1,
        likes: post.likes,
        comments: post.comments,
        isPinned: post.isPinned,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      },
    });
  } catch (e) {
    next(e);
  }
});

// 게시글 작성
router.post('/posts', async (req, res, next) => {
  try {
    const { boardType, category, title, content } = req.body;
    const email = req.user.email;

    if (!boardType || !title || !content) {
      throw new AppError('boardType, title, content는 필수입니다', 400);
    }

    const validBoardTypes = ['notice', 'share', 'contest', 'qna', 'routine', 'pattern'];
    if (!validBoardTypes.includes(boardType)) {
      throw new AppError('유효하지 않은 boardType입니다', 400);
    }

    // 공지사항은 관리자만 작성 가능 (추후 권한 체크 추가 가능)
    if (boardType === 'notice') {
      const user = await db.User.findByPk(email);
      if (!user || user.role !== 'admin' && user.role !== 'super_admin') {
        throw new AppError('공지사항은 관리자만 작성할 수 있습니다', 403);
      }
    }

    const post = await db.CommunityPost.create({
      boardType,
      category: category || null,
      title: title.trim().slice(0, 200),
      content: content.trim(),
      authorEmail: email,
      views: 0,
      likes: 0,
      comments: 0,
      isPinned: false,
    });

    res.status(201).json({
      success: true,
      data: {
        id: post.id,
        boardType: post.boardType,
        category: post.category,
        title: post.title,
        content: post.content,
        author: req.user.name || email,
        authorEmail: post.authorEmail,
        date: post.createdAt.toISOString().slice(0, 10),
        views: post.views,
        likes: post.likes,
        comments: post.comments,
        isPinned: post.isPinned,
      },
    });
  } catch (e) {
    next(e);
  }
});

// 게시글 수정
router.put('/posts/:id', async (req, res, next) => {
  try {
    const postId = parseInt(req.params.id, 10);
    if (Number.isNaN(postId)) {
      throw new AppError('유효하지 않은 게시글 ID입니다', 400);
    }

    const { title, content, category } = req.body;
    const email = req.user.email;

    const post = await db.CommunityPost.findByPk(postId);
    if (!post) {
      throw new AppError('게시글을 찾을 수 없습니다', 404);
    }

    // 작성자만 수정 가능
    if (post.authorEmail !== email) {
      const user = await db.User.findByPk(email);
      if (!user || user.role !== 'admin' && user.role !== 'super_admin') {
        throw new AppError('게시글을 수정할 권한이 없습니다', 403);
      }
    }

    const updates = {};
    if (title !== undefined) updates.title = title.trim().slice(0, 200);
    if (content !== undefined) updates.content = content.trim();
    if (category !== undefined) updates.category = category || null;

    await post.update(updates);

    res.json({
      success: true,
      data: {
        id: post.id,
        boardType: post.boardType,
        category: post.category,
        title: post.title,
        content: post.content,
        authorEmail: post.authorEmail,
        date: post.createdAt.toISOString().slice(0, 10),
        views: post.views,
        likes: post.likes,
        comments: post.comments,
        isPinned: post.isPinned,
      },
    });
  } catch (e) {
    next(e);
  }
});

// 게시글 삭제
router.delete('/posts/:id', async (req, res, next) => {
  try {
    const postId = parseInt(req.params.id, 10);
    if (Number.isNaN(postId)) {
      throw new AppError('유효하지 않은 게시글 ID입니다', 400);
    }

    const email = req.user.email;

    const post = await db.CommunityPost.findByPk(postId);
    if (!post) {
      throw new AppError('게시글을 찾을 수 없습니다', 404);
    }

    // 작성자만 삭제 가능
    if (post.authorEmail !== email) {
      const user = await db.User.findByPk(email);
      if (!user || user.role !== 'admin' && user.role !== 'super_admin') {
        throw new AppError('게시글을 삭제할 권한이 없습니다', 403);
      }
    }

    // 관련 댓글과 좋아요도 함께 삭제
    await db.CommunityComment.destroy({ where: { postId } });
    await db.CommunityPostLike.destroy({ where: { postId } });
    await post.destroy();

    res.json({
      success: true,
      message: '게시글이 삭제되었습니다',
    });
  } catch (e) {
    next(e);
  }
});

// 게시글 좋아요 토글
router.post('/posts/:id/like', async (req, res, next) => {
  try {
    const postId = parseInt(req.params.id, 10);
    if (Number.isNaN(postId)) {
      throw new AppError('유효하지 않은 게시글 ID입니다', 400);
    }

    const email = req.user.email;

    const post = await db.CommunityPost.findByPk(postId);
    if (!post) {
      throw new AppError('게시글을 찾을 수 없습니다', 404);
    }

    const existingLike = await db.CommunityPostLike.findOne({
      where: { postId, userEmail: email },
    });

    if (existingLike) {
      // 좋아요 취소
      await existingLike.destroy();
      await post.update({ likes: Math.max(0, post.likes - 1) });
      res.json({
        success: true,
        data: { liked: false, likes: Math.max(0, post.likes - 1) },
      });
    } else {
      // 좋아요 추가
      await db.CommunityPostLike.create({ postId, userEmail: email });
      await post.update({ likes: post.likes + 1 });
      res.json({
        success: true,
        data: { liked: true, likes: post.likes + 1 },
      });
    }
  } catch (e) {
    next(e);
  }
});

// 댓글 목록 조회
router.get('/posts/:id/comments', async (req, res, next) => {
  try {
    const postId = parseInt(req.params.id, 10);
    if (Number.isNaN(postId)) {
      throw new AppError('유효하지 않은 게시글 ID입니다', 400);
    }

    const comments = await db.CommunityComment.findAll({
      where: { postId },
      order: [['createdAt', 'ASC']],
      include: [
        {
          model: db.User,
          as: 'Author',
          attributes: ['email', 'name'],
          required: false,
        },
      ],
    });

    const commentList = comments.map(comment => ({
      id: comment.id,
      postId: comment.postId,
      author: comment.Author?.name || comment.authorEmail,
      authorEmail: comment.authorEmail,
      content: comment.content,
      likes: comment.likes,
      date: comment.createdAt.toISOString().slice(0, 10),
      createdAt: comment.createdAt,
    }));

    res.json({
      success: true,
      data: { list: commentList },
    });
  } catch (e) {
    next(e);
  }
});

// 댓글 작성
router.post('/posts/:id/comments', async (req, res, next) => {
  try {
    const postId = parseInt(req.params.id, 10);
    if (Number.isNaN(postId)) {
      throw new AppError('유효하지 않은 게시글 ID입니다', 400);
    }

    const { content } = req.body;
    const email = req.user.email;

    if (!content || !content.trim()) {
      throw new AppError('댓글 내용은 필수입니다', 400);
    }

    const post = await db.CommunityPost.findByPk(postId);
    if (!post) {
      throw new AppError('게시글을 찾을 수 없습니다', 404);
    }

    const comment = await db.CommunityComment.create({
      postId,
      authorEmail: email,
      content: content.trim(),
      likes: 0,
    });

    // 게시글 댓글 수 증가
    await post.update({ comments: post.comments + 1 });

    res.status(201).json({
      success: true,
      data: {
        id: comment.id,
        postId: comment.postId,
        author: req.user.name || email,
        authorEmail: comment.authorEmail,
        content: comment.content,
        likes: comment.likes,
        date: comment.createdAt.toISOString().slice(0, 10),
        createdAt: comment.createdAt,
      },
    });
  } catch (e) {
    next(e);
  }
});

// 댓글 삭제
router.delete('/comments/:id', async (req, res, next) => {
  try {
    const commentId = parseInt(req.params.id, 10);
    if (Number.isNaN(commentId)) {
      throw new AppError('유효하지 않은 댓글 ID입니다', 400);
    }

    const email = req.user.email;

    const comment = await db.CommunityComment.findByPk(commentId);
    if (!comment) {
      throw new AppError('댓글을 찾을 수 없습니다', 404);
    }

    // 작성자만 삭제 가능
    if (comment.authorEmail !== email) {
      const user = await db.User.findByPk(email);
      if (!user || user.role !== 'admin' && user.role !== 'super_admin') {
        throw new AppError('댓글을 삭제할 권한이 없습니다', 403);
      }
    }

    // 게시글 댓글 수 감소
    const post = await db.CommunityPost.findByPk(comment.postId);
    if (post) {
      await post.update({ comments: Math.max(0, post.comments - 1) });
    }

    await comment.destroy();

    res.json({
      success: true,
      message: '댓글이 삭제되었습니다',
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

