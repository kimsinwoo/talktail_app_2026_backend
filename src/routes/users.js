const express = require('express');
const router = express.Router();
const db = require('../models');
const { verifyToken } = require('../middlewares/auth');
const { apiLimiter } = require('../middlewares/rateLimiter');
const { AppError } = require('../middlewares/errorHandler');
const authController = require('../controllers/auth.controller');
const pushService = require('../services/pushService');

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

/**
 * 테스트 푸시 알림 발송 (현재 로그인 사용자 기기로)
 * POST /api/users/me/send-test-notification
 * Body: { title?: string, body?: string } (선택)
 */
router.post('/me/send-test-notification', verifyToken, apiLimiter, async (req, res, next) => {
  try {
    const email = req.user?.email;
    if (!email) throw new AppError('인증이 필요합니다.', 401);
    if (!pushService.isAvailable()) {
      throw new AppError('푸시 알림 서비스가 설정되지 않았습니다. (FCM_ENABLED, 서비스 계정 확인)', 503);
    }
    const user = await db.User.findByPk(email, { attributes: ['email', 'fcm_token'] });
    if (!user?.fcm_token || !user.fcm_token.trim()) {
      throw new AppError('등록된 푸시 토큰이 없습니다. 앱에서 알림 권한을 허용한 뒤 다시 시도해주세요.', 400);
    }
    const title = req.body?.title && typeof req.body.title === 'string' ? req.body.title : 'Talktail 테스트';
    const body = req.body?.body && typeof req.body.body === 'string' ? req.body.body : '푸시 알림이 정상적으로 동작합니다.';
    const result = await pushService.sendToToken(user.fcm_token.trim(), {
      title,
      body,
      data: { type: 'TEST' },
    });
    if (!result.success) {
      throw new AppError(result.error || '푸시 발송에 실패했습니다.', 500);
    }
    res.json({
      success: true,
      data: { messageId: result.messageId },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
