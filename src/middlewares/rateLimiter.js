const rateLimit = require('express-rate-limit');
const config = require('../config');

const isDev = config.server.env === 'development';
const rateLimitDisabled = config.security.rateLimitDisabled === true;

/**
 * 일반 API Rate Limiter
 * RATE_LIMIT_DISABLED=true 또는 개발 환경: 비활성화. 운영: 15분당 10000회
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
    if (rateLimitDisabled || isDev) return true;
    return req.path === '/health' || req.path === '/api/health';
  },
});

/**
 * 인증 관련 Rate Limiter
 * 환경 무관하게 항상 적용 (브루트포스 방지)
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: {
    success: false,
    message: '로그인 시도 횟수를 초과했습니다. 15분 후 다시 시도해주세요.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => false,
});

/**
 * 회원가입 Rate Limiter
 * 개발: 비활성화. 운영: 1시간당 30회
 */
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: '회원가입 시도 횟수를 초과했습니다. 1시간 후 다시 시도해주세요.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => rateLimitDisabled || isDev,
});

/**
 * 비밀번호 재설정 Rate Limiter
 * 환경 무관하게 항상 적용
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: '비밀번호 재설정 요청 횟수를 초과했습니다. 1시간 후 다시 시도해주세요.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => false,
});

/**
 * 결제 관련 Rate Limiter
 * 개발: 비활성화. 운영: 1분당 30회
 */
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: '결제 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => rateLimitDisabled || isDev,
});

/**
 * OAuth 요청 Rate Limiter
 * 개발: 비활성화. 운영: 15분당 50회
 */
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: {
    success: false,
    message: 'OAuth 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => rateLimitDisabled || isDev,
});

/**
 * 토큰 재발급 Rate Limiter
 * 환경 무관하게 항상 적용
 */
const tokenRefreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: '토큰 재발급 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => false,
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
