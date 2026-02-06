const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models');
const { verifyToken } = require('../middlewares/auth');
const { authLimiter, signupLimiter } = require('../middlewares/rateLimiter');
const {
  validateEmail,
  validatePassword,
  validateName,
  validatePhone,
  validateAddress,
  handleValidationErrors,
} = require('../middlewares/validator');
const { body } = require('express-validator');
const { AppError } = require('../middlewares/errorHandler');
const config = require('../config');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * 회원가입
 * POST /api/auth/signup
 * POST /api/auth/register (앱 호환용 별칭)
 */
const signupValidations = [
  validateEmail(),
  validatePassword(),
  validateName(),
  validatePhone(),
  ...validateAddress(),
  body('marketingAgreed')
    .optional()
    .isBoolean()
    .withMessage('마케팅 동의는 boolean 값이어야 합니다.'),
];

async function signupController(req, res, next) {
    try {
      const {
        email,
        password,
        name,
        phone,
        postcode,
        address,
        detail_address,
      } = req.body;

      // 이메일 중복 확인
      const existingUser = await db.User.findByPk(email);
      if (existingUser) {
        throw new AppError('이미 등록된 이메일입니다.', 409);
      }

      // 비밀번호 해싱
      const hashedPassword = await bcrypt.hash(password, config.security.bcryptRounds);

      // 사용자 생성
      const user = await db.User.create({
        email,
        password: hashedPassword,
        name,
        phone,
        postcode,
        address,
        detail_address,
        role: 'user', // 기본 역할은 user
        status: 'ACTIVE',
        isActive: true,
      });

      // JWT 토큰 생성
      const token = jwt.sign(
        { email: user.email, name: user.name, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      logger.info('User signed up', { email: user.email, role: user.role });

      res.status(201).json({
        success: true,
        message: '회원가입이 완료되었습니다.',
        data: {
          token,
          user: {
            email: user.email,
            name: user.name,
            role: user.role,
          },
        },
      });
  } catch (error) {
    next(error);
  }
}

router.post('/signup', signupLimiter, signupValidations, handleValidationErrors, signupController);
router.post('/register', signupLimiter, signupValidations, handleValidationErrors, signupController);

/**
 * 로그인
 * POST /api/auth/login
 */
router.post(
  '/login',
  authLimiter,
  (req, res, next) => {
    console.log('[Backend] 📥 POST /auth/login 수신', { email: req.body?.email ? `${req.body.email.slice(0, 3)}***` : '(없음)', hasPassword: !!req.body?.password });
    next();
  },
  [validateEmail(), validatePassword()],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      // 이메일 정규화 (소문자로 변환, 공백 제거)
      const normalizedEmail = email?.trim().toLowerCase();

      logger.info('Login attempt', { 
        originalEmail: email, 
        normalizedEmail, 
        passwordLength: password?.length 
      });

      // 사용자 조회 (이메일은 소문자로 저장되어야 함)
      const user = await db.User.findByPk(normalizedEmail);
      if (!user) {
        logger.warn('User not found', { normalizedEmail });
        // 모든 사용자 이메일 확인 (디버깅용)
        const allUsers = await db.User.findAll({ attributes: ['email'] });
        logger.warn('Available users', { emails: allUsers.map(u => u.email) });
        throw new AppError('이메일 또는 비밀번호가 올바르지 않습니다.', 401);
      }

      logger.info('User found', { email: user.email, role: user.role, isActive: user.isActive });

      // 계정 활성화 확인
      if (!user.isActive) {
        throw new AppError('비활성화된 계정입니다.', 403);
      }

      // 비밀번호 확인
      const isPasswordValid = await bcrypt.compare(password, user.password);
      logger.info('Password validation', { email: normalizedEmail, isValid: isPasswordValid });
      if (!isPasswordValid) {
        logger.warn('Failed login attempt - invalid password', { email: normalizedEmail });
        throw new AppError('이메일 또는 비밀번호가 올바르지 않습니다.', 401);
      }

      // vendor 역할 제거됨 (쇼핑몰 기능 제거)

      // 마지막 로그인 시간 업데이트
      await user.update({ lastLoginAt: new Date() });

      // JWT 토큰 생성
      const token = jwt.sign(
        { email: user.email, name: user.name, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      // Refresh 토큰 생성 (선택사항)
      const refreshToken = jwt.sign(
        { email: user.email },
        config.jwt.secret,
        { expiresIn: config.jwt.refreshExpiresIn }
      );

      // Refresh 토큰 저장
      await user.update({ refreshToken });

      logger.info('User logged in', { email: user.email });
      console.log('[Backend] ✅ 로그인 성공 200', user.email);

      res.json({
        success: true,
        message: '로그인 성공',
        data: {
          token,
          refreshToken,
          user: {
            email: user.email,
            name: user.name,
            role: user.role,
          },
        },
      });
    } catch (error) {
      console.log('[Backend] ❌ 로그인 처리 오류', error.statusCode || error.status || 500, error.message);
      next(error);
    }
  }
);

/**
 * 토큰 갱신
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh 토큰이 필요합니다.', 400);
    }

    // Refresh 토큰 검증
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.jwt.secret);
    } catch (error) {
      throw new AppError('유효하지 않은 refresh 토큰입니다.', 401);
    }

    // 사용자 조회
    const user = await db.User.findByPk(decoded.email);
    if (!user || user.refreshToken !== refreshToken) {
      throw new AppError('유효하지 않은 refresh 토큰입니다.', 401);
    }

    // 새 토큰 생성
    const newToken = jwt.sign(
      { email: user.email, name: user.name, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.json({
      success: true,
      data: {
        token: newToken,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 로그아웃
 * POST /api/auth/logout
 */
router.post('/logout', verifyToken, async (req, res, next) => {
  try {
    // Refresh 토큰 삭제
    await db.User.update(
      { refreshToken: null },
      { where: { email: req.user.email } }
    );

    logger.info('User logged out', { email: req.user.email });

    res.json({
      success: true,
      message: '로그아웃되었습니다.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 현재 사용자 정보 조회
 * GET /api/auth/me
 */
router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const user = await db.User.findByPk(req.user.email, {
      attributes: ['email', 'name', 'phone', 'postcode', 'address', 'detail_address', 'role', 'createdAt'],
    });

    if (!user) {
      throw new AppError('사용자를 찾을 수 없습니다.', 404);
    }

    res.json({
      success: true,
      data: {
        user,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 비밀번호 변경
 * POST /api/auth/change-password
 */
router.post(
  '/change-password',
  verifyToken,
  [
    validatePassword('currentPassword'),
    validatePassword('newPassword'),
    body('newPasswordConfirm')
      .custom((value, { req }) => {
        if (value !== req.body.newPassword) {
          throw new Error('새 비밀번호가 일치하지 않습니다.');
        }
        return true;
      }),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;

      const user = await db.User.findByPk(req.user.email);
      if (!user) {
        throw new AppError('사용자를 찾을 수 없습니다.', 404);
      }

      // 현재 비밀번호 확인
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        throw new AppError('현재 비밀번호가 올바르지 않습니다.', 400);
      }

      // 새 비밀번호 해싱
      const hashedPassword = await bcrypt.hash(newPassword, config.security.bcryptRounds);

      // 비밀번호 업데이트
      await user.update({ password: hashedPassword });

      logger.info('Password changed', { email: req.user.email });

      res.json({
        success: true,
        message: '비밀번호가 변경되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 비밀번호 업데이트 (앱 호환: 새 비밀번호만 전달)
 * PUT /api/auth/update
 * Body: { password: string }
 */
router.put(
  '/update',
  verifyToken,
  [
    body('password')
      .trim()
      .notEmpty()
      .withMessage('비밀번호는 필수입니다.')
      .isLength({ min: 8 })
      .withMessage('비밀번호는 8자 이상이어야 합니다.'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { password } = req.body;
      const user = await db.User.findByPk(req.user.email);
      if (!user) {
        throw new AppError('사용자를 찾을 수 없습니다.', 404);
      }
      const hashedPassword = await bcrypt.hash(password, config.security.bcryptRounds);
      await user.update({ password: hashedPassword });
      logger.info('Password updated via /auth/update', { email: req.user.email });
      res.json({
        success: true,
        message: '비밀번호가 변경되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
