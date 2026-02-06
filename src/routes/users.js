const express = require('express');
const router = express.Router();
const db = require('../models');
const { verifyToken } = require('../middlewares/auth');
const { apiLimiter } = require('../middlewares/rateLimiter');
const { AppError } = require('../middlewares/errorHandler');
const authController = require('../controllers/auth.controller');

/**
 * 회원 탈퇴
 * DELETE /api/users/me
 * Header: Authorization: Bearer <accessToken>
 */
router.delete(
  '/me',
  verifyToken,
  apiLimiter,
  authController.deleteUser
);

/**
 * FCM 디바이스 토큰 등록 (푸시 알림 수신용)
 * PUT /api/users/me/fcm-token
 * Body: { fcm_token: string } (빈 문자열이면 토큰 삭제)
 * Header: Authorization: Bearer <accessToken>
 */
router.put('/me/fcm-token', verifyToken, apiLimiter, async (req, res, next) => {
  try {
    const token = req.body?.fcm_token;
    const email = req.user?.email;
    if (!email) throw new AppError('인증이 필요합니다.', 401);
    const value = typeof token === 'string' ? token.trim() : '';
    await db.User.update(
      { fcm_token: value || null },
      { where: { email } }
    );
    res.json({
      success: true,
      data: { registered: !!value },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
