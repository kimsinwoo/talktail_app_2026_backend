const { body, param, query, validationResult } = require('express-validator');

/**
 * 검증 결과 처리 미들웨어
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errList = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value,
    }));
    console.log('[Backend] ❌ 검증 실패 (400)', req.method, req.path, errList);
    return res.status(400).json({
      success: false,
      message: '입력값 검증에 실패했습니다.',
      errors: errList,
    });
  }
  next();
};

/**
 * 이메일 검증 규칙
 */
const validateEmail = () => {
  return body('email')
    .trim()
    .notEmpty()
    .withMessage('이메일은 필수입니다.')
    .isEmail()
    .withMessage('유효한 이메일 주소를 입력해주세요.')
    .normalizeEmail()
    .isLength({ max: 100 })
    .withMessage('이메일은 100자 이하여야 합니다.');
};

/**
 * 비밀번호 검증 규칙
 */
const validatePassword = (fieldName = 'password') => {
  return body(fieldName)
    .trim()
    .notEmpty()
    .withMessage('비밀번호는 필수입니다.')
    .isLength({ min: 8, max: 100 })
    .withMessage('비밀번호는 8자 이상 100자 이하여야 합니다.')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/)
    .withMessage('비밀번호는 대문자, 소문자, 숫자, 특수문자를 포함해야 합니다.');
};

/**
 * 이름 검증 규칙
 */
const validateName = (fieldName = 'name') => {
  return body(fieldName)
    .trim()
    .notEmpty()
    .withMessage('이름은 필수입니다.')
    .isLength({ min: 1, max: 50 })
    .withMessage('이름은 1자 이상 50자 이하여야 합니다.')
    .matches(/^[가-힣a-zA-Z\s]+$/)
    .withMessage('이름은 한글, 영문만 사용 가능합니다.');
};

/**
 * 전화번호 검증 규칙
 */
const validatePhone = (fieldName = 'phone') => {
  return body(fieldName)
    .trim()
    .notEmpty()
    .withMessage('전화번호는 필수입니다.')
    .matches(/^[0-9-]+$/)
    .withMessage('유효한 전화번호 형식이 아닙니다.')
    .isLength({ min: 10, max: 20 })
    .withMessage('전화번호는 10자 이상 20자 이하여야 합니다.');
};

/**
 * MAC 주소 검증 규칙
 */
const validateMacAddress = (fieldName = 'mac_address') => {
  return body(fieldName)
    .trim()
    .notEmpty()
    .withMessage('MAC 주소는 필수입니다.')
    .matches(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/)
    .withMessage('유효한 MAC 주소 형식이 아닙니다.');
};

/**
 * 숫자 ID 검증 규칙 (param)
 */
const validateId = (paramName = 'id') => {
  return param(paramName)
    .trim()
    .notEmpty()
    .withMessage('ID는 필수입니다.')
    .isInt({ min: 1 })
    .withMessage('유효한 ID가 아닙니다.')
    .toInt();
};

/**
 * 페이징 파라미터 검증
 */
const validatePagination = () => {
  return [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('페이지는 1 이상의 정수여야 합니다.')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('limit은 1 이상 100 이하의 정수여야 합니다.')
      .toInt(),
  ];
};

/**
 * 주소 검증 규칙
 */
const validateAddress = () => {
  return [
    body('postcode')
      .trim()
      .notEmpty()
      .withMessage('우편번호는 필수입니다.')
      .isLength({ max: 20 })
      .withMessage('우편번호는 20자 이하여야 합니다.'),
    body('address')
      .trim()
      .notEmpty()
      .withMessage('주소는 필수입니다.')
      .isLength({ max: 100 })
      .withMessage('주소는 100자 이하여야 합니다.'),
    body('detail_address')
      .trim()
      .notEmpty()
      .withMessage('상세주소는 필수입니다.')
      .isLength({ max: 100 })
      .withMessage('상세주소는 100자 이하여야 합니다.'),
  ];
};

/**
 * SQL Injection 방지를 위한 문자열 이스케이프
 */
const escapeString = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\x1a/g, '\\Z');
};

/**
 * XSS 방지를 위한 HTML 이스케이프
 */
const escapeHtml = (str) => {
  if (typeof str !== 'string') return str;
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return str.replace(/[&<>"']/g, (m) => map[m]);
};

module.exports = {
  handleValidationErrors,
  validateEmail,
  validatePassword,
  validateName,
  validatePhone,
  validateMacAddress,
  validateId,
  validatePagination,
  validateAddress,
  escapeString,
  escapeHtml,
};
