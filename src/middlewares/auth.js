const jwt = require('jsonwebtoken');
const db = require('../models');
const { AppError } = require('./errorHandler');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * JWT 토큰 검증 미들웨어
 */
const verifyToken = async (req, res, next) => {
  try {
    // Authorization 헤더에서 토큰 추출
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('인증 토큰이 없습니다.', 401);
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      throw new AppError('인증 토큰이 없습니다.', 401);
    }

    // JWT_SECRET 검증
    if (!config.jwt.secret || config.jwt.secret === 'your-secret-key-change-in-production') {
      logger.error('JWT_SECRET이 설정되지 않았거나 기본값입니다.');
      throw new AppError('서버 설정 오류입니다.', 500);
    }

    // 토큰 검증
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new AppError('토큰이 만료되었습니다.', 401);
      }
      if (error.name === 'JsonWebTokenError') {
        throw new AppError('유효하지 않은 토큰입니다.', 401);
      }
      throw error;
    }

    // 사용자 조회
    const user = await db.User.findByPk(decoded.email);
    if (!user) {
      throw new AppError('유효하지 않은 사용자입니다.', 401);
    }

    // 사용자 정보를 req에 추가
    req.user = {
      email: user.email,
      name: user.name,
      role: user.role || 'user', // 역할이 있으면 사용
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * 역할 기반 접근 제어 미들웨어
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('인증이 필요합니다.', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('권한이 없습니다.', 403));
    }

    next();
  };
};

/**
 * 관리자 권한 확인
 */
const requireAdmin = requireRole('admin', 'super_admin');

/**
 * 업체 관리자 권한 확인
 */
const requireVendor = requireRole('vendor', 'admin', 'super_admin');

/**
 * 선택적 인증 미들웨어 (토큰이 있으면 검증, 없으면 통과)
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return next();
    }

    // 토큰이 있으면 검증
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await db.User.findByPk(decoded.email);
    if (user) {
      req.user = {
        email: user.email,
        name: user.name,
        role: user.role || 'user',
      };
    }

    next();
  } catch (error) {
    // 토큰 검증 실패해도 통과 (선택적 인증)
    next();
  }
};

module.exports = {
  verifyToken,
  requireRole,
  requireAdmin,
  requireVendor,
  optionalAuth,
};
