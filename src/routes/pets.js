const express = require('express');
const crypto = require('crypto');
const db = require('../models');
const { verifyToken } = require('../middlewares/auth');
const { validateName, validatePagination, handleValidationErrors } = require('../middlewares/validator');
const { body } = require('express-validator');
const { AppError } = require('../middlewares/errorHandler');
const { apiLimiter } = require('../middlewares/rateLimiter');
const logger = require('../utils/logger');

const router = express.Router();

// 모든 라우트에 인증 및 Rate Limiting 적용
router.use(verifyToken);
router.use(apiLimiter);

/**
 * 펫 목록 조회
 * GET /api/pets
 */
router.get(
  '/',
  validatePagination(),
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '20', 10);
      const offset = (page - 1) * limit;

      const { count, rows: pets } = await db.Pet.findAndCountAll({
        where: {
          user_email: req.user.email,
        },
        attributes: [
          'id',
          'pet_code',
          'name',
          'species',
          'breed',
          'weight',
          'gender',
          'neutering',
          'birthDate',
          'admissionDate',
          'veterinarian',
          'diagnosis',
          'medicalHistory',
          'device_address',
          'state',
          'image',
          'createdAt',
          'updatedAt',
        ],
        include: [
          {
            model: db.Device,
            as: 'Device',
            attributes: ['address', 'name', 'status'],
            required: false,
          },
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      res.json({
        success: true,
        data: {
          pets,
          pagination: {
            page,
            limit,
            total: count,
            totalPages: Math.ceil(count / limit),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * :id를 숫자면 id, 아니면 pet_code로 조회
 */
function petWhereFromId(idParam, userEmail) {
  const idNum = parseInt(idParam, 10);
  if (!Number.isNaN(idNum)) {
    return { id: idNum, user_email: userEmail };
  }
  return { pet_code: idParam, user_email: userEmail };
}

/**
 * 펫 상세 조회
 * GET /api/pets/:id (id: 숫자 또는 pet_code)
 */
router.get('/:id', async (req, res, next) => {
  try {
    const pet = await db.Pet.findOne({
      where: petWhereFromId(req.params.id, req.user.email),
      include: [
        {
          model: db.Device,
          as: 'Device',
          attributes: ['address', 'name', 'status', 'hub_address'],
          required: false,
        },
      ],
    });

    if (!pet) {
      throw new AppError('펫을 찾을 수 없습니다.', 404);
    }

    res.json({
      success: true,
      data: { pet },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 펫 등록
 * POST /api/pets
 */
router.post(
  '/',
  [
    validateName('name'),
    body('species')
      .notEmpty()
      .withMessage('종은 필수입니다.')
      .isIn(['dog', 'cat', 'other', '개', '고양이'])
      .withMessage('종은 dog, cat, other, 개, 고양이 중 하나여야 합니다.'),
    body('breed')
      .trim()
      .notEmpty()
      .withMessage('품종은 필수입니다.')
      .isLength({ max: 50 })
      .withMessage('품종은 50자 이하여야 합니다.'),
    body('weight')
      .trim()
      .notEmpty()
      .withMessage('체중은 필수입니다.')
      .isLength({ max: 20 })
      .withMessage('체중은 20자 이하여야 합니다.'),
    body('gender')
      .notEmpty()
      .withMessage('성별은 필수입니다.')
      .isIn(['male', 'female', 'unknown', '수컷', '암컷'])
      .withMessage('성별은 male, female, unknown, 수컷, 암컷 중 하나여야 합니다.'),
    body('neutering')
      .notEmpty()
      .withMessage('중성화 여부는 필수입니다.')
      .isIn(['yes', 'no', 'unknown', '여', '부'])
      .withMessage('중성화 여부는 yes, no, unknown, 여, 부 중 하나여야 합니다.'),
    body('birthDate')
      .optional()
      .trim()
      .isLength({ max: 20 })
      .withMessage('생년월일은 20자 이하여야 합니다.'),
    body('admissionDate')
      .optional()
      .trim()
      .isLength({ max: 20 })
      .withMessage('입원일은 20자 이하여야 합니다.'),
    body('veterinarian')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('수의사명은 50자 이하여야 합니다.'),
    body('diagnosis')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('진단명은 200자 이하여야 합니다.'),
    body('medicalHistory')
      .optional()
      .trim(),
    body('device_address')
      .optional()
      .trim()
      .matches(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/)
      .withMessage('유효한 MAC 주소 형식이 아닙니다.'),
    body('image')
      .optional()
      .isURL()
      .withMessage('유효한 이미지 URL이 아닙니다.'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      let {
        name,
        species,
        breed,
        weight,
        gender,
        neutering,
        birthDate,
        admissionDate,
        veterinarian,
        diagnosis,
        medicalHistory,
        device_address,
        image,
      } = req.body;

      // 앱 호환: species 한글 -> 영문
      if (species === '개') species = 'dog';
      else if (species === '고양이') species = 'cat';
      else if (species !== 'dog' && species !== 'cat') species = 'other';

      // 디바이스 소유권 확인 (디바이스가 지정된 경우)
      if (device_address) {
        const device = await db.Device.findOne({
          where: {
            address: device_address,
            user_email: req.user.email,
          },
        });

        if (!device) {
          throw new AppError('디바이스를 찾을 수 없거나 권한이 없습니다.', 404);
        }
      }

      // 펫 코드 생성
      const randomStr = crypto.randomBytes(3).toString('hex').toUpperCase();
      const pet_code = `PET-${Date.now()}-${randomStr}`;

      const pet = await db.Pet.create({
        pet_code,
        name,
        species,
        breed,
        weight,
        gender,
        neutering,
        birthDate,
        admissionDate,
        veterinarian,
        diagnosis,
        medicalHistory,
        user_email: req.user.email,
        device_address: device_address || null,
        state: '입원중',
        image: image || null,
      });

      logger.info('Pet created', { petId: pet.id, userEmail: req.user.email });

      res.status(201).json({
        success: true,
        message: '펫이 등록되었습니다.',
        data: { pet },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 펫 수정
 * PUT /api/pets/:id (id: 숫자 또는 pet_code)
 */
router.put(
  '/:id',
  [
    validateName('name').optional(),
    body('species')
      .optional()
      .isIn(['dog', 'cat', 'other'])
      .withMessage('종은 dog, cat, other 중 하나여야 합니다.'),
    body('device_address')
      .optional()
      .trim()
      .matches(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/)
      .withMessage('유효한 MAC 주소 형식이 아닙니다.'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const pet = await db.Pet.findOne({
        where: petWhereFromId(req.params.id, req.user.email),
      });

      if (!pet) {
        throw new AppError('펫을 찾을 수 없습니다.', 404);
      }

      // 디바이스 소유권 확인 (디바이스가 변경되는 경우)
      if (req.body.device_address && req.body.device_address !== pet.device_address) {
        const device = await db.Device.findOne({
          where: {
            address: req.body.device_address,
            user_email: req.user.email,
          },
        });

        if (!device) {
          throw new AppError('디바이스를 찾을 수 없거나 권한이 없습니다.', 404);
        }
      }

      await pet.update(req.body);

      logger.info('Pet updated', { petId: pet.id, userEmail: req.user.email });

      res.json({
        success: true,
        message: '펫 정보가 수정되었습니다.',
        data: { pet },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 펫 삭제
 * DELETE /api/pets/:id (id: 숫자 또는 pet_code)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const pet = await db.Pet.findOne({
      where: petWhereFromId(req.params.id, req.user.email),
    });

    if (!pet) {
      throw new AppError('펫을 찾을 수 없습니다.', 404);
    }

    await pet.destroy();

    logger.info('Pet deleted', { petId: req.params.id, userEmail: req.user.email });

    res.json({
      success: true,
      message: '펫이 삭제되었습니다.',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
