/**
 * Standardized auth/account error messages to prevent user enumeration.
 * Use the same message for "user not found" and "wrong password" etc.
 */

const AUTH = {
  LOGIN_FAILED: '이메일 또는 비밀번호가 올바르지 않습니다.',
  INVALID_TOKEN: '유효하지 않은 토큰입니다.',
  TOKEN_EXPIRED: '토큰이 만료되었습니다.',
  REFRESH_INVALID: '유효하지 않은 refresh 토큰입니다.',
  ACCOUNT_DISABLED: '비활성화된 계정입니다.',
};

const PASSWORD_RESET = {
  REQUEST_SENT: '해당 이메일로 안내를 보냈습니다.',
  RESET_INVALID: '링크가 만료되었거나 잘못되었습니다. 다시 요청해 주세요.',
  RESET_SUCCESS: '비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해 주세요.',
};

const RESOURCE = {
  NOT_FOUND: '해당 리소스를 찾을 수 없습니다.',
  DEVICE_NOT_FOUND: '디바이스를 찾을 수 없습니다.',
  HUB_NOT_FOUND: '허브를 찾을 수 없습니다.',
  PET_NOT_FOUND: '펫을 찾을 수 없습니다.',
};

module.exports = {
  AUTH,
  PASSWORD_RESET,
  RESOURCE,
};
