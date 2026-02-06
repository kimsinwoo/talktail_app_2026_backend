/**
 * 비밀번호 재설정 코드 저장 (메모리)
 * 프로덕션에서는 Redis 등 사용 권장
 */
const store = new Map(); // code -> { email, expiresAt }
const EMAIL_TO_CODE = new Map(); // email -> code (한 이메일당 하나의 코드만)

const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10분

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function set(email, code) {
  const expiresAt = Date.now() + CODE_EXPIRY_MS;
  const oldCode = EMAIL_TO_CODE.get(email);
  if (oldCode) store.delete(oldCode);
  store.set(code, { email: email.toLowerCase().trim(), expiresAt });
  EMAIL_TO_CODE.set(email.toLowerCase().trim(), code);
}

function get(code) {
  const raw = store.get(code);
  if (!raw) return null;
  if (Date.now() > raw.expiresAt) {
    store.delete(code);
    EMAIL_TO_CODE.delete(raw.email);
    return null;
  }
  return raw.email;
}

function consume(code) {
  const email = get(code);
  if (email) {
    store.delete(code);
    EMAIL_TO_CODE.delete(email);
  }
  return email;
}

module.exports = {
  generateCode,
  set,
  get,
  consume,
};
