const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * 일반 API Rate Limiter
 * 15분당 100회 요청 제한
 */
const apiLimiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMax,
  message: {
    success: false,
    message: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // 헬스체크 엔드포인트는 제외
    return req.path === '/health' || req.path === '/api/health';
  },
});

/**
 * 인증 관련 Rate Limiter (더 엄격)
 * 15분당 5회 시도 제한 (브루트포스 공격 방지)
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5,
  message: {
    success: false,
    message: '로그인 시도 횟수를 초과했습니다. 15분 후 다시 시도해주세요.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // 성공한 요청은 카운트에서 제외
});

/**
 * 회원가입 Rate Limiter
 * 1시간당 3회 제한
 */
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1시간
  max: 3,
  message: {
    success: false,
    message: '회원가입 시도 횟수를 초과했습니다. 1시간 후 다시 시도해주세요.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 비밀번호 재설정 Rate Limiter
 * 1시간당 3회 제한
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1시간
  max: 3,
  message: {
    success: false,
    message: '비밀번호 재설정 요청 횟수를 초과했습니다. 1시간 후 다시 시도해주세요.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 결제 관련 Rate Limiter
 * 1분당 10회 제한
 */
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 10,
  message: {
    success: false,
    message: '결제 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * OAuth 요청 Rate Limiter
 * 15분당 10회 제한
 */
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 10,
  message: {
    success: false,
    message: 'OAuth 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 토큰 재발급 Rate Limiter
 * 15분당 20회 제한
 */
const tokenRefreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 20,
  message: {
    success: false,
    message: '토큰 재발급 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  apiLimiter,
  authLimiter,
  signupLimiter,
  passwordResetLimiter,
  paymentLimiter,
  oauthLimiter,
  tokenRefreshLimiter,
};
