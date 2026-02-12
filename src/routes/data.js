/**
 * BLE 측정 데이터 수신: 앱 → 서버 → CSV 저장
 * 흐름: 디바이스(BLE) → 앱 → POST /api/data → 서버 CSV 저장
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const db = require('../models');
const { verifyToken } = require('../middlewares/auth');
const { AppError } = require('../middlewares/errorHandler');
const { apiLimiter } = require('../middlewares/rateLimiter');
const logger = require('../utils/logger');
const { sanitizeCsvCell } = require('../utils/sanitize');

const router = express.Router();
router.use(verifyToken);
router.use(apiLimiter);

const CSV_BASE_DIR = path.join(process.cwd(), 'data', 'csv');
const BLE_CSV_HEADER = 'timestamp,hr,spo2,temp,battery,samplingRate\n';

function sanitizeDeviceIdForFilename(deviceId) {
  if (typeof deviceId !== 'string') return 'unknown';
  return deviceId.replace(/[:-]/g, '-').replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 80);
}

function getBleCsvFilePath(deviceId, dateKey) {
  const safe = sanitizeDeviceIdForFilename(deviceId);
  const fileName = `ble_${safe}_${dateKey}.csv`;
  return path.join(CSV_BASE_DIR, fileName);
}

async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

async function appendBleCsvLine(filePath, timestamp, row) {
  const cells = [
    sanitizeCsvCell(timestamp),
    sanitizeCsvCell(row.hr),
    sanitizeCsvCell(row.spo2),
    sanitizeCsvCell(row.temp),
    sanitizeCsvCell(row.battery),
    sanitizeCsvCell(row.samplingRate),
  ];
  const line = cells.join(',') + '\n';
  await fs.appendFile(filePath, line, 'utf8');
}

async function createBleCsvIfNeeded(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, BLE_CSV_HEADER, 'utf8');
  }
}

/**
 * BLE 측정 데이터 수신 및 CSV 저장
 * POST /api/data
 * Body: { userEmail, petName, petId, deviceId, sessionId?, hr?, spo2?, temp?, battery?, samplingRate? }
 */
router.post('/', async (req, res, next) => {
  try {
    const { userEmail, petName, petId, deviceId, sessionId, hr, spo2, temp, battery, samplingRate } = req.body;
    const email = req.user?.email;

    if (!email) {
      throw new AppError('인증이 필요합니다.', 401);
    }
    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim() === '') {
      throw new AppError('deviceId는 필수입니다.', 400);
    }

    let device = await db.Device.findOne({
      where: { address: deviceId, user_email: email },
    });
    if (!device) {
      const normalized = deviceId.replace(/[-:]/g, '').toLowerCase();
      const all = await db.Device.findAll({ where: { user_email: email }, attributes: ['address'] });
      const matched = all.find(d => (d.address || '').replace(/[-:]/g, '').toLowerCase() === normalized);
      if (!matched) {
        throw new AppError('디바이스를 찾을 수 없거나 권한이 없습니다.', 403);
      }
    }

    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);
    const timestamp = now.toISOString().replace('T', ' ').slice(0, 19);

    const row = {
      hr: hr != null ? Number(hr) : '',
      spo2: spo2 != null ? Number(spo2) : '',
      temp: temp != null ? Number(temp) : '',
      battery: battery != null ? Number(battery) : '',
      samplingRate: samplingRate != null ? Number(samplingRate) : '',
    };

    const filePath = getBleCsvFilePath(deviceId, dateKey);
    await createBleCsvIfNeeded(filePath);
    await appendBleCsvLine(filePath, timestamp, row);

    logger.info('BLE data saved to CSV', { deviceId: deviceId.slice(0, 12) + '***', dateKey });

    res.status(201).json({
      success: true,
      message: '저장되었습니다.',
      data: { deviceId, timestamp, dateKey },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
