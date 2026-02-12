/**
 * MQTT disconnected:{mac} 수신 시 처리: 디바이스 조회, 5분 쿨다운, FCM 발송, 상태 업데이트
 * - mac 주소 소문자 normalize
 * - notification + data 동시 포함 (data-only 금지)
 * - 실패 시 invalid token 제거
 */
const db = require('../models');
const pushService = require('./pushService');

const COOLDOWN_MS = 5 * 60 * 1000; // 5분
const INVALID_TOKEN_CODES = [
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
];

function getLogger() {
  try {
    return require('../utils/logger');
  } catch {
    return { info: console.log, warn: console.warn, error: console.error };
  }
}

/**
 * mac_address로 디바이스 조회 (대소문자 무시)
 * @param {string} macAddress - 이미 소문자로 normalize된 값
 * @returns {Promise<import('../models').Device|null>}
 */
async function findDeviceByMac(macAddress) {
  if (!macAddress || typeof macAddress !== 'string' || !macAddress.trim()) {
    return null;
  }
  const normalized = macAddress.trim().toLowerCase();
  const device = await db.Device.findOne({
    where: db.sequelize.where(
      db.sequelize.fn('LOWER', db.sequelize.col('address')),
      normalized
    ),
    raw: false,
  });
  return device;
}

/**
 * disconnected 수신 처리
 * - 디바이스 조회 → 없으면 종료
 * - 이미 offline이면 무시
 * - 5분 쿨다운 적용
 * - 유저 FCM 토큰으로 푸시 (notification + data) → 실패 시 invalid token 제거
 * - 디바이스 status = 'offline', lastDisconnectedAt 갱신
 * @param {string} macAddress - 소문자로 normalize된 MAC 주소
 * @param {object} [io] - Socket.IO 인스턴스 (있으면 user 룸에 DEVICE_DISCONNECTED 전송)
 */
async function handleDisconnected(macAddress, io = null) {
  const logger = getLogger();
  const normalized = typeof macAddress === 'string' ? macAddress.trim().toLowerCase() : '';
  if (!normalized) {
    logger.warn('[deviceDisconnected] mac 주소 없음');
    return;
  }

  const device = await findDeviceByMac(normalized);
  if (!device) {
    logger.warn('[deviceDisconnected] 디바이스 없음:', normalized);
    return;
  }

  const now = new Date();
  const nowMs = now.getTime();

  if (device.status === 'offline') {
    logger.info('[deviceDisconnected] 이미 offline, 무시:', device.address);
    return;
  }

  const lastAt = device.lastDisconnectedAt ? new Date(device.lastDisconnectedAt).getTime() : 0;
  if (lastAt && nowMs - lastAt < COOLDOWN_MS) {
    logger.info('[deviceDisconnected] 5분 쿨다운 중, 무시:', device.address);
    return;
  }

  const user = await db.User.findByPk(device.user_email, { attributes: ['email', 'fcm_token'] });
  if (!user || !user.fcm_token || typeof user.fcm_token !== 'string' || !user.fcm_token.trim()) {
    logger.warn('[deviceDisconnected] FCM 토큰 없음:', device.user_email);
    await device.update({ status: 'offline', lastDisconnectedAt: now });
    return;
  }

  const token = user.fcm_token.trim();
  const deviceName = device.name || device.address || '디바이스';
  const title = '디바이스 연결 해제';
  const body = `${deviceName}의 디바이스 연결이 해제되었습니다.`;
  const data = {
    type: 'DEVICE_DISCONNECTED',
    deviceId: String(device.address),
  };

  if (io && typeof io.to === 'function') {
    const payload = { hubId: device.hub_address, deviceMac: device.address };
    io.to(`user:${device.user_email}`).emit('DEVICE_DISCONNECTED', payload);
    io.to(`user:${device.user_email}`).emit('device_disconnected', payload);
    logger.info('[deviceDisconnected] Socket.IO 전송:', { address: device.address });
  }

  const result = await pushService.sendToToken(token, {
    title,
    body,
    data,
  });

  if (result.success) {
    logger.info('[deviceDisconnected] 푸시 발송:', deviceName, '->', device.user_email);
  } else {
    const errCode = result.error && String(result.error);
    if (INVALID_TOKEN_CODES.some((code) => errCode.includes(code))) {
      await db.User.update({ fcm_token: null }, { where: { email: device.user_email } });
      logger.warn('[deviceDisconnected] invalid token 제거:', device.user_email);
    } else {
      logger.warn('[deviceDisconnected] 푸시 실패:', result.error);
    }
  }

  await device.update({ status: 'offline', lastDisconnectedAt: now });
  logger.info('[deviceDisconnected] 디바이스 상태 업데이트:', device.address, '-> offline');
}

module.exports = {
  handleDisconnected,
  findDeviceByMac,
  COOLDOWN_MS,
};
