const express = require('express');
const { Op } = require('sequelize');
const db = require('../models');
const { verifyToken } = require('../middlewares/auth');
const { validateMacAddress, handleValidationErrors } = require('../middlewares/validator');
const { AppError } = require('../middlewares/errorHandler');
const { apiLimiter } = require('../middlewares/rateLimiter');
const logger = require('../utils/logger');
const { body } = require('express-validator');

const router = express.Router();

// 모든 라우트에 인증 및 Rate Limiting 적용
router.use(verifyToken);
router.use(apiLimiter);

/**
 * 디바이스 목록 조회
 * GET /api/device?hubAddress=...
 */
router.get('/', async (req, res, next) => {
  try {
    const { hubAddress } = req.query;

    const where = {
      user_email: req.user.email,
    };

    // hubAddress 파라미터가 있으면 해당 허브의 디바이스만 조회
    if (hubAddress) {
      // 허브 소유권 확인
      const hub = await db.Hub.findOne({
        where: {
          address: hubAddress,
          user_email: req.user.email,
        },
      });

      if (!hub) {
        throw new AppError('접근 권한이 없습니다.', 403);
      }
      where.hub_address = hubAddress;
    }

    const devices = await db.Device.findAll({
      where,
      include: [
        {
          model: db.Hub,
          as: 'Hub',
          attributes: ['address', 'name'],
        },
        {
          model: db.Pet,
          as: 'Pet',
          attributes: ['id', 'name', 'species', 'breed', 'pet_code'],
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({
      success: true,
      count: devices.length,
      data: devices.map(device => ({
        id: device.address,
        address: device.address,
        name: device.name,
        hub_address: device.hub_address,
        hubName: device.Hub?.name || '',
        status: device.status,
        lastSeenAt: device.lastSeenAt,
        connectedPet: device.Pet
          ? {
              id: device.Pet.id,
              name: device.Pet.name,
              species: device.Pet.species,
              breed: device.Pet.breed,
              pet_code: device.Pet.pet_code,
            }
          : null,
        updatedAt: device.updatedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 디바이스 상세 조회
 * GET /api/device/:deviceAddress
 */
router.get('/:deviceAddress', async (req, res, next) => {
  try {
    const { deviceAddress } = req.params;

    // MAC 주소 형식 검증
    if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(deviceAddress)) {
      throw new AppError('유효한 MAC 주소 형식이 아닙니다.', 400);
    }

    const device = await db.Device.findOne({
      where: {
        address: deviceAddress,
        user_email: req.user.email, // 소유권 확인
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
 */
router.post(
  '/',
  [
    body('address')
      .trim()
      .notEmpty()
      .withMessage('MAC 주소는 필수입니다.')
      .matches(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/)
      .withMessage('유효한 MAC 주소 형식이 아닙니다.'),
    body('name')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('디바이스 이름은 50자 이하여야 합니다.'),
    body('hubAddress')
      .trim()
      .notEmpty()
      .withMessage('허브 주소는 필수입니다.')
      .matches(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/)
      .withMessage('유효한 MAC 주소 형식이 아닙니다.'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { address, name, hubAddress } = req.body;

      // 허브 소유권 확인
      const hub = await db.Hub.findOne({
        where: {
          address: hubAddress,
          user_email: req.user.email,
        },
      });

      if (!hub) {
        throw new AppError('허브를 찾을 수 없거나 접근 권한이 없습니다.', 404);
      }

      // 중복 확인
      const existingDevice = await db.Device.findByPk(address);
      if (existingDevice) {
        if (existingDevice.user_email === req.user.email) {
          throw new AppError('이미 등록된 디바이스입니다.', 409);
        }
        // 다른 사용자의 디바이스인 경우 재등록
        existingDevice.name = name && name.trim() ? name.trim() : address.slice(-5);
        existingDevice.hub_address = hubAddress;
        existingDevice.user_email = req.user.email;
        await existingDevice.save();

        logger.info('Device re-registered', { deviceAddress: address, userEmail: req.user.email });

        return res.json({
          success: true,
          message: '디바이스가 재등록되었습니다.',
          data: {
            id: existingDevice.address,
            address: existingDevice.address,
            name: existingDevice.name,
            hub_address: existingDevice.hub_address,
          },
        });
      }

      // 디바이스 생성
      const deviceName = name && name.trim() ? name.trim() : address.slice(-5);
      const device = await db.Device.create({
        address,
        name: deviceName,
        hub_address: hubAddress,
        user_email: req.user.email,
        status: 'unknown',
      });

      logger.info('Device created', { deviceAddress: address, userEmail: req.user.email });

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
  }
);

/**
 * 디바이스 수정
 * PUT /api/device/:deviceAddress
 */
router.put(
  '/:deviceAddress',
  [
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('디바이스 이름은 1자 이상 50자 이하여야 합니다.'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { deviceAddress } = req.params;
      const { name } = req.body;

      // MAC 주소 형식 검증
      if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(deviceAddress)) {
        throw new AppError('유효한 MAC 주소 형식이 아닙니다.', 400);
      }

      const device = await db.Device.findOne({
        where: {
          address: deviceAddress,
          user_email: req.user.email, // 소유권 확인
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
  }
);

/**
 * 디바이스 삭제
 * DELETE /api/device/:deviceAddress
 */
router.delete('/:deviceAddress', async (req, res, next) => {
  try {
    const { deviceAddress } = req.params;

    // MAC 주소 형식 검증
    if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(deviceAddress)) {
      throw new AppError('유효한 MAC 주소 형식이 아닙니다.', 400);
    }

    const device = await db.Device.findOne({
      where: {
        address: deviceAddress,
        user_email: req.user.email, // 소유권 확인
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

const petConnectionValidations = [
  body('petId')
    .optional()
    .custom((v) => v === undefined || v === null || (Number.isInteger(Number(v)) && Number(v) >= 1))
    .withMessage('펫 ID는 양의 정수여야 합니다.'),
  body('pet_code').optional().trim(),
];

async function petConnectionController(req, res, next) {
  try {
    const { deviceAddress } = req.params;
    const { petId, pet_code: petCode } = req.body;

    if (!/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(deviceAddress)) {
      throw new AppError('유효한 MAC 주소 형식이 아닙니다.', 400);
    }

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
router.put(
  '/:deviceAddress/pet',
  petConnectionValidations,
  handleValidationErrors,
  petConnectionController
);

router.put(
  '/:deviceAddress/patient',
  petConnectionValidations,
  handleValidationErrors,
  petConnectionController
);

module.exports = router;
