const logger = require('../utils/logger');
const config = require('../config');

/**
 * 커스텀 에러 클래스
 */
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 전역 에러 핸들러 미들웨어
 */
const errorHandler = (err, req, res, next) => {
  // 이미 응답이 전송된 경우
  if (res.headersSent) {
    return next(err);
  }

  // 로깅 (파일 + 콘솔에 항상 출력해 원인 파악 가능하게)
  const errMeta = {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    user: req.user?.email || 'anonymous',
  };
  logger.error('Error occurred:', errMeta);
  console.error('[Backend] Error occurred:', err.message, err.stack);

  // 운영 환경이 아닌 경우 스택 트레이스 포함
  const isDevelopment = config.server.env === 'development';

  // 커스텀 에러인 경우
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(isDevelopment && { stack: err.stack }),
    });
  }

  // JWT 에러
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: '유효하지 않은 토큰입니다.',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: '토큰이 만료되었습니다.',
    });
  }

  // Sequelize 에러
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      success: false,
      message: '입력값 검증에 실패했습니다.',
      errors: err.errors.map(e => ({
        field: e.path,
        message: e.message,
      })),
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      success: false,
      message: '이미 존재하는 데이터입니다.',
      field: err.errors[0]?.path,
    });
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      success: false,
      message: '관련된 데이터가 존재하여 작업을 수행할 수 없습니다.',
    });
  }

  // 기본 에러 응답
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 && !isDevelopment
    ? '서버 오류가 발생했습니다.'
    : err.message;

  res.status(statusCode).json({
    success: false,
    message,
    ...(isDevelopment && { stack: err.stack }),
  });
};

/**
 * 404 핸들러
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `경로를 찾을 수 없습니다: ${req.method} ${req.url}`,
  });
};

module.exports = {
  AppError,
  errorHandler,
  notFoundHandler,
};
