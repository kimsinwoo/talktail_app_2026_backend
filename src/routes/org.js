const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../models');
const config = require('../config');
const { verifyToken } = require('../middlewares/auth');
const { AppError } = require('../middlewares/errorHandler');
const { apiLimiter } = require('../middlewares/rateLimiter');
const logger = require('../utils/logger');

const router = express.Router();

// 모든 라우트에 인증 및 Rate Limiting 적용
router.use(verifyToken);
router.use(apiLimiter);

/**
 * 사용자 정보 조회 (일반 사용자 프로필)
 * POST /api/org/load
 * 인증: Authorization Bearer 토큰만 사용. Body 불필요.
 */
router.post('/load', async (req, res, next) => {
  try {
    const user = await db.User.findOne({
      where: { email: req.user.email },
      attributes: ['email', 'name', 'phone', 'postcode', 'address', 'detail_address'],
    });

    if (!user) {
      throw new AppError('사용자를 찾을 수 없습니다.', 404);
    }

    const fullAddress = [user.address, user.detail_address].filter(Boolean).join(' ');

    const data = {
      device_code: '',
      org_name: user.name,
      org_address: fullAddress || user.address || '',
      org_id: user.email,
      org_pw: '',
      org_phone: user.phone || '',
      org_email: user.email,
    };

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 사용자 정보 수정
 * POST /api/org/update
 */
router.post('/update', async (req, res, next) => {
  try {
    const {
      org_name,
      org_address,
      org_phone,
      postcode,
      detail_address,
    } = req.body;

    const user = await db.User.findOne({
      where: { email: req.user.email },
    });

    if (!user) {
      throw new AppError('사용자를 찾을 수 없습니다.', 404);
    }

    await user.update({
      name: org_name != null ? org_name : user.name,
      phone: org_phone != null ? org_phone : user.phone,
      address: org_address != null ? org_address : user.address,
      detail_address: detail_address != null ? detail_address : user.detail_address,
      postcode: postcode != null ? postcode : user.postcode,
    });

    const fullAddress = [user.address, user.detail_address].filter(Boolean).join(' ');

    res.json({
      success: true,
      message: '사용자 정보가 수정되었습니다.',
      data: {
        device_code: '',
        org_name: user.name,
        org_address: fullAddress || user.address || '',
        org_id: user.email,
        org_phone: user.phone,
        org_email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 사용자 정보 수정 (앱 changeInfo 호환)
 * POST /api/org/changeInfo
 */
router.post('/changeInfo', async (req, res, next) => {
  try {
    const {
      org_name,
      org_address,
      org_phone,
      postcode,
      detail_address,
    } = req.body;

    const user = await db.User.findOne({
      where: { email: req.user.email },
    });

    if (!user) {
      throw new AppError('사용자를 찾을 수 없습니다.', 404);
    }

    await user.update({
      name: org_name != null ? org_name : user.name,
      phone: org_phone != null ? org_phone : user.phone,
      address: org_address != null ? org_address : user.address,
      detail_address: detail_address != null ? detail_address : user.detail_address,
      postcode: postcode != null ? postcode : user.postcode,
    });

    const fullAddress = [user.address, user.detail_address].filter(Boolean).join(' ');

    res.json({
      success: true,
      message: '사용자 정보가 수정되었습니다.',
      data: {
        device_code: '',
        org_name: user.name,
        org_address: fullAddress || user.address || '',
        org_id: user.email,
        org_phone: user.phone,
        org_email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 사용자 비밀번호 변경
 * POST /api/org/changePW
 * Body: { org_pw, org_new_pw }
 */
router.post('/changePW', async (req, res, next) => {
  try {
    const { org_pw: currentPassword, org_new_pw: newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new AppError('현재 비밀번호와 새 비밀번호가 필요합니다.', 400);
    }

    const user = await db.User.findOne({
      where: { email: req.user.email },
    });

    if (!user) {
      throw new AppError('사용자를 찾을 수 없습니다.', 404);
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new AppError('현재 비밀번호가 올바르지 않습니다.', 401);
    }

    const hashedPassword = await bcrypt.hash(newPassword, config.security.bcryptRounds);
    await user.update({ password: hashedPassword });

    logger.info('Password changed (user profile)', { email: req.user.email });

    res.json({
      success: true,
      message: '비밀번호가 변경되었습니다.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 사용자 비밀번호 검증 (예: 계정 삭제 전 확인)
 * POST /api/org/verifyPassword
 * Body: { password }
 */
router.post('/verifyPassword', async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) {
      throw new AppError('비밀번호가 필요합니다.', 400);
    }

    const user = await db.User.findOne({
      where: { email: req.user.email },
    });

    if (!user) {
      throw new AppError('사용자를 찾을 수 없습니다.', 404);
    }

    const isValid = await bcrypt.compare(password, user.password);

    res.json({
      success: true,
      data: { valid: isValid },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 약관 동의 조회 (일반 사용자)
 * POST /api/org/loadAgree
 */
router.post('/loadAgree', async (req, res, next) => {
  try {
    // User 모델에 약관 필드가 없으면 기본값 반환
    res.json({
      success: true,
      data: {
        agree_marketing: false,
        agree_sms: false,
        agree_email: false,
        agree_push: false,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 약관 동의 수정 (일반 사용자)
 * POST /api/org/changeAgree
 */
router.post('/changeAgree', async (req, res, next) => {
  try {
    res.json({
      success: true,
      message: '약관 동의가 저장되었습니다.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 계정 삭제 (회원 탈퇴)
 * POST /api/org/delete
 */
router.post('/delete', async (req, res, next) => {
  try {
    const user = await db.User.findOne({
      where: { email: req.user.email },
    });

    if (!user) {
      throw new AppError('사용자를 찾을 수 없습니다.', 404);
    }

    await db.sequelize.transaction(async (t) => {
      await user.destroy({ transaction: t });
    });

    logger.info('User account deleted (profile)', { email: req.user.email });

    res.json({
      success: true,
      message: '계정이 삭제되었습니다.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 계정 삭제 (회원 탈퇴) - DELETE 메서드
 * DELETE /api/org
 */
router.delete('/', async (req, res, next) => {
  try {
    const user = await db.User.findOne({
      where: { email: req.user.email },
    });

    if (!user) {
      throw new AppError('사용자를 찾을 수 없습니다.', 404);
    }

    await db.sequelize.transaction(async (t) => {
      await user.destroy({ transaction: t });
    });

    logger.info('User account deleted (profile)', { email: req.user.email });

    res.json({
      success: true,
      message: '계정이 삭제되었습니다.',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
