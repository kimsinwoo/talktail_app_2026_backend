const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { verifyToken } = require('../middlewares/auth');
const { validateMacAddress, handleValidationErrors } = require('../middlewares/validator');
const { body } = require('express-validator');
const { AppError } = require('../middlewares/errorHandler');
const { apiLimiter } = require('../middlewares/rateLimiter');
const logger = require('../utils/logger');

const router = express.Router();

// 모든 라우트에 인증 및 Rate Limiting 적용
router.use(verifyToken);
router.use(apiLimiter);

/**
 * 허브 목록 조회
 * GET /api/hub
 */
router.get('/', async (req, res, next) => {
  try {
    const hubs = await db.Hub.findAll({
      where: {
        user_email: req.user.email,
      },
      attributes: ['address', 'name', 'user_email', 'is_change', 'status', 'lastSeenAt', 'createdAt', 'updatedAt'],
      include: [
        {
          model: db.Device,
          as: 'Devices',
          attributes: ['address', 'name', 'hub_address', 'status'],
          include: [
            {
              model: db.Pet,
              as: 'Pet',
              attributes: ['id', 'name', 'pet_code'],
              required: false,
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({
      success: true,
      count: hubs.length,
      data: hubs.map(hub => ({
        id: hub.address,
        address: hub.address,
        name: hub.name,
        user_email: hub.user_email,
        is_change: hub.is_change,
        status: hub.status,
        lastSeenAt: hub.lastSeenAt,
        connectedDevices: hub.Devices?.length || 0,
        updatedAt: hub.updatedAt,
        devices: hub.Devices?.map(device => ({
          id: device.address,
          address: device.address,
          name: device.name,
          hub_address: device.hub_address,
          status: device.status,
          connectedPet: device.Pet
            ? {
                id: device.Pet.id,
                name: device.Pet.name,
                pet_code: device.Pet.pet_code,
              }
            : null,
        })) || [],
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 허브 상세 조회
 * GET /api/hub/:hubAddress
 */
router.get('/:hubAddress', async (req, res, next) => {
  try {
    const { hubAddress } = req.params;

    // MAC 주소 형식 검증
    if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(hubAddress)) {
      throw new AppError('유효한 MAC 주소 형식이 아닙니다.', 400);
    }

    const hub = await db.Hub.findOne({
      where: {
        address: hubAddress,
        user_email: req.user.email, // 소유권 확인
      },
      include: [
        {
          model: db.Device,
          as: 'Devices',
          include: [
            {
              model: db.Pet,
              as: 'Pet',
              required: false,
            },
          ],
        },
      ],
    });

    if (!hub) {
      throw new AppError('허브를 찾을 수 없습니다.', 404);
    }

    res.json({
      success: true,
      data: {
        id: hub.address,
        address: hub.address,
        name: hub.name,
        user_email: hub.user_email,
        is_change: hub.is_change,
        status: hub.status,
        lastSeenAt: hub.lastSeenAt,
        devices: hub.Devices || [],
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 허브 등록
 * POST /api/hub
 */
router.post(
  '/',
  [
    body('mac_address')
      .trim()
      .notEmpty()
      .withMessage('MAC 주소는 필수입니다.')
      .matches(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/)
      .withMessage('유효한 MAC 주소 형식이 아닙니다.'),
    body('name')
      .trim()
      .notEmpty()
      .withMessage('허브 이름은 필수입니다.')
      .isLength({ min: 1, max: 50 })
      .withMessage('허브 이름은 1자 이상 50자 이하여야 합니다.'),
    body('wifi_id').optional().trim(),
    body('wifi_password').optional().trim(),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { mac_address, name, wifi_id, wifi_password, user_email } = req.body;

      // 중복 확인
      const existingHub = await db.Hub.findByPk(mac_address);
      if (existingHub) {
        throw new AppError('이미 등록된 허브입니다.', 409);
      }

      // Hub 생성
      const hub = await db.Hub.create({
        address: mac_address,
        name,
        user_email: user_email || req.user.email,
        is_change: false,
        status: 'unknown',
      });

      // MQTT 서비스가 있으면 토픽 구독 (hub_project/back의 MQTT 서비스 사용)
      const mqttService = req.app.get('mqtt');
      if (mqttService) {
        // MQTT 토픽 구독은 MQTT 서비스에서 자동으로 처리됨
        logger.info('Hub registered, MQTT service available', { hubAddress: mac_address });
      }

      // WiFi 설정이 제공된 경우 처리 (선택사항)
      if (wifi_id && wifi_password && mqttService) {
        const wifiSettingsTopic = `hub/${mac_address}/wifi-config`;
        const wifiSettings = {
          ssid: wifi_id,
          password: wifi_password,
          timestamp: new Date().toISOString(),
        };
        mqttService.publish(wifiSettingsTopic, wifiSettings, { qos: 1, retain: false });
      }

      logger.info('Hub created', { hubAddress: mac_address, userEmail: req.user.email });

      res.status(201).json({
        success: true,
        message: '허브가 등록되었습니다.',
        data: {
          id: hub.address,
          address: hub.address,
          name: hub.name,
          user_email: hub.user_email,
          is_change: hub.is_change,
          status: hub.status,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 허브 수정
 * PUT /api/hub/:hubAddress
 */
router.put(
  '/:hubAddress',
  [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('허브 이름은 1자 이상 50자 이하여야 합니다.'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { hubAddress } = req.params;
      const { name } = req.body;

      // MAC 주소 형식 검증
      if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(hubAddress)) {
        throw new AppError('유효한 MAC 주소 형식이 아닙니다.', 400);
      }

      const hub = await db.Hub.findOne({
        where: {
          address: hubAddress,
          user_email: req.user.email, // 소유권 확인
        },
      });

      if (!hub) {
        throw new AppError('허브를 찾을 수 없습니다.', 404);
      }

      if (name) {
        hub.name = name;
        await hub.save();
      }

      logger.info('Hub updated', { hubAddress, userEmail: req.user.email });

      res.json({
        success: true,
        message: '허브 정보가 수정되었습니다.',
        data: {
          id: hub.address,
          address: hub.address,
          name: hub.name,
          user_email: hub.user_email,
          is_change: hub.is_change,
          status: hub.status,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 허브 삭제
 * DELETE /api/hub/:hubAddress
 */
router.delete('/:hubAddress', async (req, res, next) => {
  try {
    const { hubAddress } = req.params;

    // MAC 주소 형식 검증
    if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(hubAddress)) {
      throw new AppError('유효한 MAC 주소 형식이 아닙니다.', 400);
    }

    const hub = await db.Hub.findOne({
      where: {
        address: hubAddress,
        user_email: req.user.email, // 소유권 확인
      },
    });

    if (!hub) {
      throw new AppError('허브를 찾을 수 없습니다.', 404);
    }

    // 트랜잭션으로 연쇄 삭제 처리
    const result = await db.sequelize.transaction(async (t) => {
      // 허브에 연결된 디바이스 조회
      const devices = await db.Device.findAll({
        where: {
          hub_address: hubAddress,
          user_email: req.user.email,
        },
        include: [
          {
            model: db.Pet,
            as: 'Pet',
            required: false,
          },
        ],
        transaction: t,
      });

      // 각 디바이스에 연결된 펫의 device_address를 null로 설정
      for (const device of devices) {
        if (device.Pet) {
          device.Pet.device_address = null;
          await device.Pet.save({ transaction: t });
        }
      }

      // 관련 Telemetries 레코드 먼저 삭제
      const deviceAddresses = devices.map(d => d.address);
      if (deviceAddresses.length > 0) {
        await db.Telemetry.destroy({
          where: {
            device_address: {
              [Op.in]: deviceAddresses,
            },
          },
          transaction: t,
        });
        logger.info(`Deleted Telemetry records for ${deviceAddresses.length} devices`);
      }

      // 디바이스 삭제
      const deletedDevices = await db.Device.destroy({
        where: {
          hub_address: hubAddress,
          user_email: req.user.email,
        },
        transaction: t,
      });

      // 허브 삭제
      await hub.destroy({ transaction: t });

      return { deletedDevices };
    });

    logger.info('Hub deleted', { hubAddress, deletedDevices: result.deletedDevices });

    res.json({
      success: true,
      message: '허브가 삭제되었습니다.',
      deletedDevices: result.deletedDevices,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
