const express = require('express');
const db = require('../models');
const { verifyToken } = require('../middlewares/auth');
const { AppError } = require('../middlewares/errorHandler');
const { apiLimiter } = require('../middlewares/rateLimiter');
const logger = require('../utils/logger');

const router = express.Router();

// 모든 라우트에 인증 및 Rate Limiting 적용
router.use(verifyToken);
router.use(apiLimiter);

/**
 * 최근 Telemetry 데이터 조회 (Telemetry Worker에서)
 * GET /api/telemetry/recent/:deviceAddress?limit=100
 */
router.get('/recent/:deviceAddress', (req, res, next) => {
  try {
    const { deviceAddress } = req.params;
    const limit = parseInt(req.query.limit || '100', 10);

    // MAC 주소 형식 검증
    if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(deviceAddress)) {
      throw new AppError('유효한 MAC 주소 형식이 아닙니다.', 400);
    }

    // 디바이스 소유권 확인
    db.Device.findOne({
      where: {
        address: deviceAddress,
        user_email: req.user.email,
      },
    })
      .then(device => {
        if (!device) {
          throw new AppError('디바이스를 찾을 수 없거나 권한이 없습니다.', 404);
        }

        const telemetryWorker = req.app.get('telemetryWorker');
        if (!telemetryWorker) {
          throw new AppError('Telemetry Worker가 초기화되지 않았습니다.', 503);
        }

        const data = telemetryWorker.getRecentData(deviceAddress, limit);

        res.json({
          success: true,
          deviceAddress,
          count: data.length,
          data,
        });
      })
      .catch(next);
  } catch (error) {
    next(error);
  }
});

/**
 * 모든 디바이스의 최근 데이터 조회
 * GET /api/telemetry/recent?limit=100
 */
router.get('/recent', (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);

    const telemetryWorker = req.app.get('telemetryWorker');
    if (!telemetryWorker) {
      throw new AppError('Telemetry Worker가 초기화되지 않았습니다.', 503);
    }

    const data = telemetryWorker.getAllRecentData(limit);

    res.json({
      success: true,
      devices: Object.keys(data),
      count: Object.values(data).reduce((sum, arr) => sum + arr.length, 0),
      data,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DB에서 최근 데이터 조회
 * GET /api/telemetry/db/recent/:deviceAddress?limit=100
 */
router.get('/db/recent/:deviceAddress', async (req, res, next) => {
  try {
    const { deviceAddress } = req.params;
    const limit = parseInt(req.query.limit || '100', 10);

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

    const data = await db.Telemetry.findAll({
      where: {
        device_address: deviceAddress,
      },
      order: [['timestamp', 'DESC']],
      limit,
      attributes: [
        'device_address',
        'timestamp',
        'starttime',
        'ir',
        'red',
        'green',
        'spo2',
        'hr',
        'temp',
        'battery',
        'createdAt',
      ],
    });

    // 데이터 형식 변환
    const formattedData = data
      .map(record => ({
        device_mac_address: record.device_address,
        timestamp: record.timestamp,
        starttime: record.starttime,
        ir: record.ir,
        red: record.red,
        green: record.green,
        spo2: record.spo2,
        hr: record.hr,
        temp: record.temp,
        battery: record.battery,
        createdAt: record.createdAt,
      }))
      .reverse(); // 최신순으로 정렬

    res.json({
      success: true,
      deviceAddress,
      count: formattedData.length,
      data: formattedData,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 최신 Telemetry 데이터 조회 (실시간)
 * GET /api/telemetry/latest
 * GET /api/telemetry/latest/:deviceId
 */
router.get('/latest', (req, res, next) => {
  try {
    const telemetryWorker = req.app.get('telemetryWorker');
    if (!telemetryWorker) {
      throw new AppError('Telemetry Worker가 초기화되지 않았습니다.', 503);
    }

    const data = telemetryWorker.getLatestTelemetry(null);

    res.json({
      success: true,
      deviceId: 'all',
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/latest/:deviceId', async (req, res, next) => {
  try {
    const { deviceId } = req.params;

    // MAC 주소 형식 검증
    if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(deviceId)) {
      throw new AppError('유효한 MAC 주소 형식이 아닙니다.', 400);
    }

    // 디바이스 소유권 확인
    const device = await db.Device.findOne({
      where: {
        address: deviceId,
        user_email: req.user.email,
      },
    });

    if (!device) {
      throw new AppError('디바이스를 찾을 수 없거나 권한이 없습니다.', 404);
    }

    const telemetryWorker = req.app.get('telemetryWorker');
    if (!telemetryWorker) {
      throw new AppError('Telemetry Worker가 초기화되지 않았습니다.', 503);
    }

    const data = telemetryWorker.getLatestTelemetry(deviceId);

    res.json({
      success: true,
      deviceId,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
