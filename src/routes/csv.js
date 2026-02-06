const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../models');
const { verifyToken } = require('../middlewares/auth');
const { validateMacAddress, handleValidationErrors } = require('../middlewares/validator');
const { AppError } = require('../middlewares/errorHandler');
const { apiLimiter } = require('../middlewares/rateLimiter');
const logger = require('../utils/logger');

const router = express.Router();

// 모든 라우트에 인증 및 Rate Limiting 적용
router.use(verifyToken);
router.use(apiLimiter);

// CSV 파일 저장 경로
const CSV_BASE_DIR = path.join(process.cwd(), 'data', 'csv');

/**
 * 디바이스별 CSV 목록 조회
 * GET /api/csv/device/:deviceAddress
 */
router.get('/device/:deviceAddress', async (req, res, next) => {
  try {
    const { deviceAddress } = req.params;

    // MAC 주소 형식 검증
    if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(deviceAddress)) {
      throw new AppError('유효한 MAC 주소 형식이 아닙니다.', 400);
    }

    // 디바이스 소유권 확인
    const device = await db.Device.findOne({
      where: {
        address: deviceAddress,
        user_email: req.user.email,
      },
    });

    if (!device) {
      throw new AppError('디바이스를 찾을 수 없거나 권한이 없습니다.', 404);
    }

    const userCsvDir = path.join(CSV_BASE_DIR, req.user.email.replace(/[^a-zA-Z0-9@._-]/g, '_'));
    const safeDevice = deviceAddress.replace(/:/g, '_');

    if (!fs.existsSync(userCsvDir)) {
      return res.json({ success: true, files: [] });
    }

    const results = [];
    const dates = fs.readdirSync(userCsvDir, { withFileTypes: true });

    for (const dateEntry of dates) {
      if (!dateEntry.isDirectory()) continue;

      const date = dateEntry.name;
      const dateDir = path.join(userCsvDir, date);
      const deviceDir = path.join(dateDir, safeDevice);

      if (!fs.existsSync(deviceDir)) continue;

      const pets = fs.readdirSync(deviceDir, { withFileTypes: true });
      for (const petEntry of pets) {
        if (!petEntry.isDirectory()) continue;

        const petName = petEntry.name;
        const petDir = path.join(deviceDir, petName);

        const files = fs.readdirSync(petDir).filter(f => f.endsWith('.csv'));
        for (const file of files) {
          const fullPath = path.join(petDir, file);
          const stat = fs.statSync(fullPath);
          results.push({
            date,
            device: safeDevice,
            pet: petName,
            filename: file,
            size: stat.size,
            mtime: stat.mtime,
            relativePath: path.relative(userCsvDir, fullPath),
          });
        }
      }
    }

    res.json({ success: true, files: results });
  } catch (error) {
    next(error);
  }
});

/**
 * CSV 파일 다운로드
 * GET /api/csv/download?path=...
 */
router.get('/download', async (req, res, next) => {
  try {
    const { path: filePath } = req.query;

    if (!filePath) {
      throw new AppError('파일 경로가 필요합니다.', 400);
    }

    // 경로 보안 검증 (상위 디렉토리 접근 방지)
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..')) {
      throw new AppError('잘못된 파일 경로입니다.', 400);
    }

    const userCsvDir = path.join(CSV_BASE_DIR, req.user.email.replace(/[^a-zA-Z0-9@._-]/g, '_'));
    const fullPath = path.join(userCsvDir, normalizedPath);

    // 사용자 디렉토리 내의 파일인지 확인
    if (!fullPath.startsWith(userCsvDir)) {
      throw new AppError('접근 권한이 없습니다.', 403);
    }

    if (!fs.existsSync(fullPath)) {
      throw new AppError('파일을 찾을 수 없습니다.', 404);
    }

    res.download(fullPath, path.basename(fullPath), err => {
      if (err) {
        logger.error('CSV download error:', err);
        if (!res.headersSent) {
          next(err);
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * CSV 파일 삭제
 * DELETE /api/csv?path=...
 */
router.delete('/', async (req, res, next) => {
  try {
    const { path: filePath } = req.query;

    if (!filePath) {
      throw new AppError('파일 경로가 필요합니다.', 400);
    }

    // 경로 보안 검증
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..')) {
      throw new AppError('잘못된 파일 경로입니다.', 400);
    }

    const userCsvDir = path.join(CSV_BASE_DIR, req.user.email.replace(/[^a-zA-Z0-9@._-]/g, '_'));
    const fullPath = path.join(userCsvDir, normalizedPath);

    // 사용자 디렉토리 내의 파일인지 확인
    if (!fullPath.startsWith(userCsvDir)) {
      throw new AppError('접근 권한이 없습니다.', 403);
    }

    if (!fs.existsSync(fullPath)) {
      throw new AppError('파일을 찾을 수 없습니다.', 404);
    }

    fs.unlinkSync(fullPath);

    logger.info('CSV file deleted', { filePath: normalizedPath, userEmail: req.user.email });

    res.json({
      success: true,
      message: '파일이 삭제되었습니다.',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
