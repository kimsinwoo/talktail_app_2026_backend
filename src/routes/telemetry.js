const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { verifyToken } = require('../middlewares/auth');
const { AppError } = require('../middlewares/errorHandler');
const { apiLimiter } = require('../middlewares/rateLimiter');
const logger = require('../utils/logger');

const router = express.Router();

router.use(verifyToken);
router.use(apiLimiter);

/**
 * 텔레메트리 목록 조회 (페이지네이션)
 * GET /api/telemetry?hub_address=&device_mac=&page=1&limit=50&from=&to=
 */
router.get('/', async (req, res, next) => {
  try {
    const { hub_address: hubAddress, device_mac: deviceMac, page = 1, limit = 50, from, to } = req.query;
    if (!hubAddress && !deviceMac) {
      throw new AppError('hub_address 또는 device_mac 중 하나는 필수입니다.', 400);
    }
    const where = {};

    if (hubAddress) {
      const hub = await db.Hub.findOne({ where: { address: hubAddress, user_email: req.user.email } });
      if (!hub) throw new AppError('허브를 찾을 수 없거나 권한이 없습니다.', 403);
      where.hub_address = hubAddress;
    }
    if (deviceMac) {
      const device = await db.Device.findOne({ where: { address: deviceMac, user_email: req.user.email } });
      if (!device) throw new AppError('디바이스를 찾을 수 없거나 권한이 없습니다.', 403);
      where.device_address = deviceMac;
    }
    if (from != null || to != null) {
      where.timestamp = {};
      if (from != null) where.timestamp[Op.gte] = Number(from) || 0;
      if (to != null) where.timestamp[Op.lte] = Number(to) || Number.MAX_SAFE_INTEGER;
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await db.Telemetry.findAndCountAll({
      where,
      order: [['timestamp', 'DESC']],
      limit: limitNum,
      offset,
      attributes: ['id', 'hub_address', 'device_address', 'timestamp', 'spo2', 'hr', 'temp', 'battery', 'payload', 'createdAt'],
    });

    res.json({
      success: true,
      data: rows,
      pagination: { page: pageNum, limit: limitNum, total: count, totalPages: Math.ceil(count / limitNum) },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 텔레메트리 생성 (허브/디바이스에서 전송)
 * POST /api/telemetry
 * Body: { hub_address, device_address, timestamp, payload? } or { hub_address, device_address, timestamp, spo2?, hr?, temp?, battery? }
 */
router.post('/', async (req, res, next) => {
  try {
    const { hub_address: hubAddress, device_address: deviceAddress, timestamp, payload, spo2, hr, temp, battery } = req.body;
    if (!hubAddress || !deviceAddress || timestamp == null) {
      throw new AppError('hub_address, device_address, timestamp는 필수입니다.', 400);
    }
    const hub = await db.Hub.findOne({ where: { address: hubAddress, user_email: req.user.email } });
    if (!hub) throw new AppError('허브를 찾을 수 없거나 권한이 없습니다.', 403);
    const device = await db.Device.findOne({ where: { address: deviceAddress, user_email: req.user.email } });
    if (!device) throw new AppError('디바이스를 찾을 수 없거나 권한이 없습니다.', 403);

    const record = await db.Telemetry.create({
      hub_address: hubAddress,
      device_address: deviceAddress,
      timestamp: Number(timestamp) || Date.now(),
      payload: payload || null,
      spo2: spo2 != null ? Number(spo2) : null,
      hr: hr != null ? Number(hr) : null,
      temp: temp != null ? Number(temp) : null,
      battery: battery != null ? Number(battery) : null,
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user.email}`).emit('telemetry_created', {
        id: record.id,
        hub_address: record.hub_address,
        device_address: record.device_address,
        timestamp: record.timestamp,
      });
    }

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

/**
 * 텔레메트리 삭제
 * DELETE /api/telemetry?hub_address=&device_mac=
 * 둘 다 없으면 400. hub_address만 있으면 해당 허브 전체, device_mac만 있으면 해당 디바이스 전체.
 */
router.delete('/', async (req, res, next) => {
  try {
    const { hub_address: hubAddress, device_mac: deviceMac } = req.query;
    if (!hubAddress && !deviceMac) {
      throw new AppError('hub_address 또는 device_mac 중 하나는 필수입니다.', 400);
    }
    const where = {};
    if (hubAddress) {
      const hub = await db.Hub.findOne({ where: { address: hubAddress, user_email: req.user.email } });
      if (!hub) throw new AppError('허브를 찾을 수 없거나 권한이 없습니다.', 403);
      where.hub_address = hubAddress;
    }
    if (deviceMac) {
      const device = await db.Device.findOne({ where: { address: deviceMac, user_email: req.user.email } });
      if (!device) throw new AppError('디바이스를 찾을 수 없거나 권한이 없습니다.', 403);
      where.device_address = deviceMac;
    }

    const deleted = await db.Telemetry.destroy({ where });
    res.json({ success: true, message: '텔레메트리 삭제 완료.', deleted });
  } catch (error) {
    next(error);
  }
});

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
