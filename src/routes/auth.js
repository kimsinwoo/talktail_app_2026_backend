const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models');
const { verifyToken } = require('../middlewares/auth');
const { authLimiter, signupLimiter, passwordResetLimiter, tokenRefreshLimiter } = require('../middlewares/rateLimiter');
const refreshTokenService = require('../services/refreshTokenService');
const emailService = require('../services/emailService');
const passwordResetStore = require('../utils/passwordResetStore');
const passwordResetService = require('../services/passwordResetService');
const { AppError } = require('../middlewares/errorHandler');
const config = require('../config');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * 회원가입
 * POST /api/auth/signup
 * POST /api/auth/register (앱 호환용 별칭)
 */
async function signupController(req, res, next) {
    try {
      const {
        email,
        username,
        password,
        name,
        phone,
        postcode,
        address,
        detail_address,
      } = req.body;

      if (!username || typeof username !== 'string' || !username.trim()) {
        throw new AppError('사용자 아이디를 입력해주세요.', 400);
      }
      const trimmedUsername = username.trim();
      if (!/^[a-zA-Z0-9_]{4,20}$/.test(trimmedUsername)) {
        throw new AppError('아이디는 4~20자, 영문/숫자/언더스코어만 사용 가능합니다.', 400);
      }

      // 이메일 중복 확인
      const existingByEmail = await db.User.findByPk(email);
      if (existingByEmail) {
        throw new AppError('이미 등록된 이메일입니다.', 409);
      }

      // 아이디 중복 확인
      const existingByUsername = await db.User.findOne({ where: { username: trimmedUsername } });
      if (existingByUsername) {
        throw new AppError('이미 사용 중인 아이디입니다.', 409);
      }

      // 비밀번호 해싱
      const hashedPassword = await bcrypt.hash(password, config.security.bcryptRounds);

      // 사용자 생성
      const user = await db.User.create({
        email,
        username: trimmedUsername,
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

router.post('/signup', signupLimiter, signupController);
router.post('/register', signupLimiter, signupController);

/**
 * 아이디(username) 중복 확인
 * GET /api/auth/check-username?username=xxx
 */
router.get('/check-username', authLimiter, async (req, res, next) => {
  try {
    const username = (req.query.username || '').trim();
    if (!username) {
      throw new AppError('아이디를 입력해주세요.', 400);
    }
    if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
      return res.json({ success: true, available: false, message: '아이디는 4~20자, 영문/숫자/언더스코어만 사용 가능합니다.' });
    }
    const existing = await db.User.findOne({ where: { username } });
    if (existing) {
      return res.json({ success: true, available: false, message: '이미 사용 중인 아이디입니다.' });
    }
    return res.json({ success: true, available: true, message: '사용 가능한 아이디입니다.' });
  } catch (error) {
    next(error);
  }
});

/**
 * 로그인
 * POST /api/auth/login
 */
router.post(
  '/login',
  authLimiter,
  (req, res, next) => {
    console.log('[Backend] 📥 POST /auth/login 수신', { loginId: (req.body?.loginId || req.body?.email) ? `${String(req.body.loginId || req.body.email).slice(0, 3)}***` : '(없음)', hasPassword: !!req.body?.password });
    next();
  },
  async (req, res, next) => {
    try {
      const { email, password, loginId } = req.body;
      const raw = (loginId != null ? loginId : email)?.trim();
      if (!raw) {
        throw new AppError('이메일 또는 아이디를 입력해주세요.', 400);
      }

      const isEmail = raw.includes('@');
      let user;
      if (isEmail) {
        const normalizedEmail = raw.toLowerCase();
        user = await db.User.findByPk(normalizedEmail);
      } else {
        user = await db.User.findOne({ where: { username: raw } });
      }

      logger.info('Login attempt', { loginId: raw.slice(0, 3) + '***', isEmail, passwordLength: password?.length });

      if (!user) {
        logger.warn('User not found', { loginId: raw });
        throw new AppError('이메일 또는 비밀번호가 올바르지 않습니다.', 401);
      }

      logger.info('User found', { email: user.email, role: user.role, isActive: user.isActive });

      // 계정 활성화 확인
      if (!user.isActive) {
        throw new AppError('비활성화된 계정입니다.', 403);
      }

      // 비밀번호 확인
      const isPasswordValid = await bcrypt.compare(password, user.password);
      logger.info('Password validation', { loginId: raw.slice(0, 3) + '***', isValid: isPasswordValid });
      if (!isPasswordValid) {
        logger.warn('Failed login attempt - invalid password', { loginId: raw });
        throw new AppError('이메일 또는 비밀번호가 올바르지 않습니다.', 401);
      }

      // vendor 역할 제거됨 (쇼핑몰 기능 제거)

      // 마지막 로그인 시간 업데이트
      await user.update({ lastLoginAt: new Date() });

      // Access 토큰 생성
      const token = jwt.sign(
        { email: user.email, name: user.name, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      // Refresh 토큰 생성 및 DB 저장 (rotation용)
      const refreshToken = await refreshTokenService.createRefreshToken(
        user.email,
        req.get('user-agent'),
        req.ip
      );

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
 * 토큰 갱신 (Refresh Token Rotation)
 * POST /api/auth/refresh
 */
router.post('/refresh', tokenRefreshLimiter, async (req, res, next) => {
  try {
    const raw = req.body.refreshToken;
    if (!raw) {
      throw new AppError('Refresh 토큰이 필요합니다.', 400);
    }

    const tokenHash = refreshTokenService.hashToken(raw);
    const reused = await refreshTokenService.isTokenReused(tokenHash);
    if (reused) {
      const record = await db.RefreshToken.findOne({ where: { tokenHash } });
      if (record) await refreshTokenService.revokeAllForUser(record.userId);
      logger.warn('Refresh token reuse detected', { userId: record?.userId });
      throw new AppError('유효하지 않은 refresh 토큰입니다.', 401);
    }

    let decoded;
    try {
      decoded = jwt.verify(raw, config.jwt.secret);
    } catch {
      throw new AppError('유효하지 않은 refresh 토큰입니다.', 401);
    }

    const tokenRecord = await refreshTokenService.findValidToken(tokenHash);
    if (!tokenRecord) {
      throw new AppError('유효하지 않은 refresh 토큰입니다.', 401);
    }

    const user = await db.User.findByPk(tokenRecord.userId);
    if (!user) {
      throw new AppError('유효하지 않은 refresh 토큰입니다.', 401);
    }

    await refreshTokenService.revokeTokenById(tokenRecord.id);
    const newAccess = jwt.sign(
      { email: user.email, name: user.name, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
    const newRefresh = await refreshTokenService.createRefreshToken(
      user.email,
      req.get('user-agent'),
      req.ip
    );

    res.json({
      success: true,
      data: {
        token: newAccess,
        refreshToken: newRefresh,
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
    await refreshTokenService.revokeAllForUser(req.user.email);
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
        throw new AppError('현재 비밀번호가 올바르지 않습니다. 다시 입력해주세요.', 400);
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
        message: '비밀번호가 수정되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 아이디(이메일) 찾기
 * POST /api/auth/find-id
 * Body: { name, phone }
 * 응답: { success, maskedEmail } 또는 일치 계정 없음
 */
function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

router.post(
  '/find-id',
  authLimiter,
  async (req, res, next) => {
    try {
      const { name, phone } = req.body;
      const normalizedPhone = normalizePhone(phone || '');
      const users = await db.User.findAll({
        where: { name: name.trim() },
        attributes: ['email', 'phone'],
      });
      const user = users.find(
        (u) => u.phone && normalizePhone(u.phone) === normalizedPhone
      );
      if (!user) {
        return res.status(200).json({
          success: false,
          message: '일치하는 계정이 없습니다.',
        });
      }
      res.json({
        success: true,
        maskedEmail: maskEmail(user.email),
        message: '가입된 이메일을 찾았습니다.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 비밀번호 재설정 요청 (DB 토큰 + 링크 발송, 사용자 열거 방지)
 * POST /api/auth/forgot-password
 * Body: { email }
 * 존재 여부와 관계없이 동일 응답
 */
router.post(
  '/forgot-password',
  passwordResetLimiter,
  async (req, res, next) => {
    try {
      const email = (req.body.email || '').trim().toLowerCase();
      if (!email) {
        throw new AppError('이메일을 입력해 주세요.', 400);
      }
      if (!emailService.isEmailConfigured()) {
        return res.status(200).json({
          success: true,
          message: '해당 이메일로 안내를 보냈습니다.',
        });
      }
      const user = await db.User.findByPk(email);
      if (user && user.password) {
        try {
          const { token, expiresAt } = await passwordResetService.createResetToken(email);
          const sent = await emailService.sendPasswordResetLink(
            email,
            token,
            passwordResetService.TOKEN_EXPIRY_MINUTES
          );
          if (!sent) {
            logger.warn('Password reset email failed', { email: email.slice(0, 3) + '***' });
          }
        } catch (err) {
          logger.error('Password reset token create failed', { message: err.message });
        }
      }
      res.json({
        success: true,
        message: '해당 이메일로 안내를 보냈습니다.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 비밀번호 재설정 (DB 토큰 소비, 시도 제한 적용)
 * POST /api/auth/reset-password
 * Body: { token, newPassword } (또는 레거시: { email, code, newPassword })
 */
router.post(
  '/reset-password',
  passwordResetLimiter,
  async (req, res, next) => {
    try {
      const { token, newPassword, email, code } = req.body;
      let resolvedEmail = null;

      if (token && typeof token === 'string') {
        resolvedEmail = await passwordResetService.consumeResetToken(token.trim());
      } else if (email && code) {
        const normalizedEmail = (email || '').trim().toLowerCase();
        const storedEmail = passwordResetStore.consume(String(code));
        if (storedEmail && storedEmail === normalizedEmail) {
          resolvedEmail = normalizedEmail;
        }
      }

      if (!resolvedEmail) {
        return res.status(400).json({
          success: false,
          message: '링크가 만료되었거나 잘못되었습니다. 다시 요청해 주세요.',
        });
      }

      const user = await db.User.findByPk(resolvedEmail);
      if (!user) {
        return res.status(400).json({
          success: false,
          message: '링크가 만료되었거나 잘못되었습니다. 다시 요청해 주세요.',
        });
      }

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        throw new AppError('새 비밀번호는 8자 이상이어야 합니다.', 400);
      }

      const hashedPassword = await bcrypt.hash(newPassword, config.security.bcryptRounds);
      await user.update({ password: hashedPassword });
      logger.info('Password reset completed', { email: resolvedEmail.slice(0, 3) + '***' });
      res.json({
        success: true,
        message: '비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해 주세요.',
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
