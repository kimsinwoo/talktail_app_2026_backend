const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../models');
const { verifyToken } = require('../middlewares/auth');
const { AppError } = require('../middlewares/errorHandler');
const { apiLimiter } = require('../middlewares/rateLimiter');
const { resolvePathWithinBase, assertFileExists } = require('../middlewares/pathSecurity');
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
    const userCsvDir = path.join(CSV_BASE_DIR, req.user.email.replace(/[^a-zA-Z0-9@._-]/g, '_'));
    const fullPath = resolvePathWithinBase(userCsvDir, req.query.path);
    assertFileExists(fullPath);
    res.download(fullPath, path.basename(fullPath), (err) => {
      if (err) {
        logger.error('CSV download error:', err);
        if (!res.headersSent) next(err);
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
    const userCsvDir = path.join(CSV_BASE_DIR, req.user.email.replace(/[^a-zA-Z0-9@._-]/g, '_'));
    const fullPath = resolvePathWithinBase(userCsvDir, req.query.path);
    assertFileExists(fullPath);
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
