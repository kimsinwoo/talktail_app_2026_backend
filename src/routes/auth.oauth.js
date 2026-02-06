const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');
const { oauthLimiter, tokenRefreshLimiter, apiLimiter } = require('../middlewares/rateLimiter');
const authController = require('../controllers/auth.controller');

/**
 * OAuth 시작
 * POST /api/auth/:provider/start
 * Body: { redirect_uri? }
 */
router.post(
  '/:provider/start',
  oauthLimiter,
  authController.startOAuth
);

/**
 * OAuth 콜백 처리
 * POST /api/auth/:provider/callback
 * Body: { code, state, code_verifier, redirect_uri? }
 */
router.post(
  '/:provider/callback',
  oauthLimiter,
  authController.handleOAuthCallback
);

/**
 * 토큰 재발급
 * POST /api/auth/token/refresh
 * Body: { refreshToken }
 */
router.post(
  '/token/refresh',
  tokenRefreshLimiter,
  authController.refreshToken
);

/**
 * 로그아웃
 * POST /api/auth/logout
 * Body: { refreshToken }
 */
router.post(
  '/logout',
  apiLimiter,
  authController.logout
);

module.exports = router;
