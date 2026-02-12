const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { verifyToken } = require('../middlewares/auth');
const { requireDeviceOwnership } = require('../middlewares/deviceOwnership');
const { AppError } = require('../middlewares/errorHandler');
const { apiLimiter } = require('../middlewares/rateLimiter');
const logger = require('../utils/logger');

const router = express.Router();

// 모든 라우트에 인증 및 Rate Limiting 적용
router.use(verifyToken);
router.use(apiLimiter);

/**
 * 디바이스 목록 조회
 * GET /api/device?hubAddress=... (쿼리 없으면 해당 사용자 전체 디바이스)
 */
router.get('/', async (req, res, next) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      throw new AppError('인증이 필요합니다.', 401);
    }

    const hubAddress = req.query?.hubAddress;
    const where = { user_email: userEmail };

    if (hubAddress) {
      const hub = await db.Hub.findOne({
        where: { address: hubAddress, user_email: userEmail },
      });
      if (!hub) {
        throw new AppError('접근 권한이 없습니다.', 403);
      }
      where.hub_address = hubAddress;
    }

    const devices = await db.Device.findAll({
      where,
      include: [
        { model: db.Hub, as: 'Hub', attributes: ['address', 'name'], required: false },
        { model: db.Pet, as: 'Pet', attributes: ['id', 'name', 'species', 'breed', 'pet_code'], required: false },
      ],
      order: [['createdAt', 'DESC']],
    });

    const data = devices.map((device) => ({
      id: device.address,
      address: device.address,
      name: device.name ?? '',
      hub_address: device.hub_address ?? null,
      hubName: (device.Hub && device.Hub.name) ? device.Hub.name : '',
      status: device.status ?? 'unknown',
      lastSeenAt: device.lastSeenAt ?? null,
      lastConnectedAt: device.lastConnectedAt ?? null,
      battery: device.battery ?? null,
      lastDisconnectedAt: device.lastDisconnectedAt ?? null,
      connectedPet: device.Pet
        ? {
            id: device.Pet.id,
            name: device.Pet.name ?? '',
            species: device.Pet.species ?? '',
            breed: device.Pet.breed ?? '',
            pet_code: device.Pet.pet_code ?? '',
          }
        : null,
      updatedAt: device.updatedAt,
    }));

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
});

/**
 * 디바이스 상세 조회
 * GET /api/device/:deviceAddress
 */
router.get('/:deviceAddress', requireDeviceOwnership('deviceAddress'), async (req, res, next) => {
  try {
    const deviceAddress = req.params.deviceAddress;

    const device = await db.Device.findOne({
      where: {
        address: deviceAddress,
        user_email: req.user.email,
      },
      include: [
        {
          model: db.Hub,
          as: 'Hub',
          attributes: ['address', 'name', 'status'],
        },
        {
          model: db.Pet,
          as: 'Pet',
          required: false,
        },
      ],
    });

    if (!device) {
      throw new AppError('디바이스를 찾을 수 없습니다.', 404);
    }

    res.json({
      success: true,
      data: {
        id: device.address,
        address: device.address,
        name: device.name,
        hub_address: device.hub_address,
        hubName: device.Hub?.name || '',
        status: device.status,
        lastSeenAt: device.lastSeenAt,
        connectedPet: device.Pet || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 디바이스 등록
 * POST /api/device
 * Body: { address, name?, hubAddress? }
 * - hubAddress 있음: 허브 소유권 확인 후 등록 (address는 MAC 형식)
 * - hubAddress 없음/null: BLE 직접 연결용 등록 (address는 MAC 또는 iOS UUID 등, 최대 4대)
 */
const BLE_DEVICE_MAX = 4;

router.post('/', async (req, res, next) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      throw new AppError('인증이 필요합니다.', 401);
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    let address = body.address != null ? String(body.address).trim() : '';
    const name = body.name != null ? String(body.name).trim() : '';
    const hubAddress = body.hubAddress != null ? String(body.hubAddress).trim() : '';

    if (!address) {
      throw new AppError('디바이스 주소(ID)는 필수입니다.', 400);
    }

    const isBleOnly = hubAddress === '';

    if (isBleOnly) {
      const bleCount = await db.Device.count({
        where: {
          user_email: userEmail,
          hub_address: { [Op.or]: [null, ''] },
        },
      });
      if (bleCount >= BLE_DEVICE_MAX) {
        throw new AppError(`BLE 디바이스는 최대 ${BLE_DEVICE_MAX}대까지 등록할 수 있습니다.`, 400);
      }
    } else {
      const hub = await db.Hub.findOne({
        where: { address: hubAddress, user_email: userEmail },
      });
      if (!hub) {
        throw new AppError('허브를 찾을 수 없거나 접근 권한이 없습니다.', 404);
      }
    }

    const existingDevice = await db.Device.findByPk(address);
    if (existingDevice) {
      if (existingDevice.user_email === userEmail) {
        throw new AppError('이미 등록된 디바이스입니다.', 409);
      }
      // 다른 계정에 이미 등록된 디바이스는 재바인딩 불가 (cross-account takeover 방지)
      throw new AppError('이미 다른 계정에 등록된 디바이스입니다.', 409);
    }

    const rawName = name || (address.length > 8 ? `디바이스 ${address.slice(-6)}` : address);
    const deviceName = String(rawName).slice(0, 50) || 'Device';
    const device = await db.Device.create({
      address: address.length > 100 ? address.slice(0, 100) : address,
      name: deviceName,
      hub_address: isBleOnly ? null : hubAddress,
      user_email: userEmail,
      status: 'unknown',
    });
    logger.info('Device created', { deviceAddress: address, userEmail, bleOnly: isBleOnly });

    res.status(201).json({
      success: true,
      message: '디바이스가 등록되었습니다.',
      data: {
        id: device.address,
        address: device.address,
        name: device.name,
        hub_address: device.hub_address,
        status: device.status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 디바이스 수정
 * PUT /api/device/:deviceAddress
 */
router.put('/:deviceAddress', requireDeviceOwnership('deviceAddress'), async (req, res, next) => {
  try {
    const deviceAddress = req.params.deviceAddress;
    const { name } = req.body;

    const device = await db.Device.findOne({
      where: {
        address: deviceAddress,
        user_email: req.user.email,
      },
    });

    if (!device) {
      throw new AppError('디바이스를 찾을 수 없습니다.', 404);
    }

      if (name) {
        device.name = name;
        await device.save();
      }

      logger.info('Device updated', { deviceAddress, userEmail: req.user.email });

      res.json({
        success: true,
        message: '디바이스 정보가 수정되었습니다.',
        data: {
          id: device.address,
          address: device.address,
          name: device.name,
          hub_address: device.hub_address,
          status: device.status,
        },
      });
    } catch (error) {
      next(error);
    }
});

/**
 * 디바이스 텔레메트리 삭제
 * POST /api/device/:deviceAddress/delete_data
 */
router.post('/:deviceAddress/delete_data', async (req, res, next) => {
  try {
    const { deviceAddress } = req.params;
    const device = await db.Device.findOne({
      where: { address: deviceAddress, user_email: req.user.email },
    });
    if (!device) throw new AppError('디바이스를 찾을 수 없습니다.', 404);

    const deleted = await db.Telemetry.destroy({
      where: { device_address: deviceAddress },
    });

    const mqttService = req.app.get('mqtt');
    if (mqttService && typeof mqttService.publish === 'function') {
      const topic = `hub/${device.hub_address}/receive`;
      mqttService.publish(topic, `delete_device:${deviceAddress}`, { qos: 1 });
    }
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user.email}`).emit('device_data_deleted', { deviceAddress, deleted });
    }

    logger.info('Device delete_data', { deviceAddress, deleted, userEmail: req.user.email });
    res.json({ success: true, message: '디바이스 텔레메트리 삭제 완료.', deleted });
  } catch (error) {
    next(error);
  }
});

/**
 * 디바이스 상태/배터리 업데이트
 * PATCH /api/device/:deviceAddress/status
 * Body: { status?: 'online'|'offline'|'unknown', lastSeenAt?: string, lastConnectedAt?: string, battery?: number }
 */
router.patch('/:deviceAddress/status', async (req, res, next) => {
  try {
    const { deviceAddress } = req.params;
    const { status, lastSeenAt, lastConnectedAt, battery } = req.body;
    const device = await db.Device.findOne({
      where: { address: deviceAddress, user_email: req.user.email },
    });
    if (!device) throw new AppError('디바이스를 찾을 수 없습니다.', 404);

    if (status != null) device.status = status;
    if (lastSeenAt != null) device.lastSeenAt = new Date(lastSeenAt);
    if (lastConnectedAt != null) device.lastConnectedAt = new Date(lastConnectedAt);
    if (status === 'online' && (lastConnectedAt == null) && device.lastConnectedAt == null) {
      device.lastConnectedAt = new Date();
    }
    if (battery != null && Number.isInteger(Number(battery))) device.battery = Number(battery);
    await device.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user.email}`).emit('device_status_updated', {
        deviceAddress,
        status: device.status,
        lastSeenAt: device.lastSeenAt,
        lastConnectedAt: device.lastConnectedAt,
        battery: device.battery,
      });
    }
    res.json({
      success: true,
      data: {
        address: device.address,
        status: device.status,
        lastSeenAt: device.lastSeenAt,
        lastConnectedAt: device.lastConnectedAt,
        battery: device.battery,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 디바이스 삭제
 * DELETE /api/device/:deviceAddress
 */
router.delete('/:deviceAddress', requireDeviceOwnership('deviceAddress'), async (req, res, next) => {
  try {
    const deviceAddress = req.params.deviceAddress;

    const device = await db.Device.findOne({
      where: {
        address: deviceAddress,
        user_email: req.user.email,
      },
      include: [
        {
          model: db.Pet,
          as: 'Pet',
          required: false,
        },
      ],
    });

    if (!device) {
      throw new AppError('디바이스를 찾을 수 없습니다.', 404);
    }

    // 트랜잭션으로 연쇄 삭제 처리
    await db.sequelize.transaction(async (t) => {
      // 연결된 펫의 device_address를 null로 설정
      if (device.Pet) {
        device.Pet.device_address = null;
        await device.Pet.save({ transaction: t });
      }

      // 관련 Telemetries 레코드 먼저 삭제
      await db.Telemetry.destroy({
        where: {
          device_address: deviceAddress,
        },
        transaction: t,
      });

      // 디바이스 삭제
      await device.destroy({ transaction: t });
    });

    logger.info('Device deleted', { deviceAddress, userEmail: req.user.email });

    res.json({
      success: true,
      message: '디바이스가 삭제되었습니다.',
    });
  } catch (error) {
    next(error);
  }
});

async function petConnectionController(req, res, next) {
  try {
    const { deviceAddress } = req.params;
    const { petId, pet_code: petCode } = req.body;

    const device = await db.Device.findOne({
      where: {
        address: deviceAddress,
        user_email: req.user.email,
      },
    });

    if (!device) {
      throw new AppError('디바이스를 찾을 수 없습니다.', 404);
    }

    const petIdToUse = petId != null ? Number(petId) : null;

    if (petIdToUse || petCode) {
      const whereClause = petCode
        ? { pet_code: petCode.trim(), user_email: req.user.email }
        : { id: petIdToUse, user_email: req.user.email };
      const pet = await db.Pet.findOne({
        where: whereClause,
      });

      if (!pet) {
        throw new AppError('펫을 찾을 수 없습니다.', 404);
      }

      pet.device_address = deviceAddress;
      await pet.save();

      logger.info('Pet connected to device', { deviceAddress, petId: pet.id, pet_code: pet.pet_code, userEmail: req.user.email });

      res.json({
        success: true,
        message: '펫이 연결되었습니다.',
      });
    } else {
      const pet = await db.Pet.findOne({
        where: {
          device_address: deviceAddress,
          user_email: req.user.email,
        },
      });

      if (pet) {
        pet.device_address = null;
        await pet.save();

        logger.info('Pet disconnected from device', { deviceAddress, petId: pet.id, userEmail: req.user.email });
      }

      res.json({
        success: true,
        message: '펫 연결이 해제되었습니다.',
      });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * 디바이스에 펫 연결/해제
 * PUT /api/device/:deviceAddress/pet
 * PUT /api/device/:deviceAddress/patient (앱 호환 별칭)
 * Body: { petId?: number } 또는 { pet_code?: string }
 */
router.put('/:deviceAddress/pet', requireDeviceOwnership('deviceAddress'), petConnectionController);
router.put('/:deviceAddress/patient', requireDeviceOwnership('deviceAddress'), petConnectionController);

module.exports = router;
