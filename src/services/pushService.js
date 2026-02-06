/**
 * FCM 푸시 알림 발송 서비스
 * - FCM_ENABLED=true 및 서비스 계정 설정 시에만 실제 발송
 * - 설정 없으면 로그만 남기고 스킵
 */
const path = require('path');
let admin = null;
let messaging = null;
let initialized = false;

function getLogger() {
  try {
    return require('../utils/logger');
  } catch {
    return { info: console.log, warn: console.warn, error: console.error };
  }
}

/**
 * FCM Admin SDK 초기화
 * @param {object} config - config.fcm { enabled, credentialPath }
 * @returns {boolean} 실제로 사용 가능 여부
 */
function init(config) {
  if (initialized) return !!messaging;
  const logger = getLogger();
  if (!config || !config.fcm || !config.fcm.enabled) {
    logger.info('[Push] FCM disabled (FCM_ENABLED not set)');
    initialized = true;
    return false;
  }
  try {
    admin = require('firebase-admin');
    const fs = require('fs');
    const credPath = config.fcm.credentialPath || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const resolvedPath = credPath ? path.resolve(credPath) : '';
    if (resolvedPath && fs.existsSync(resolvedPath)) {
      const key = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
      admin.initializeApp({ credential: admin.credential.cert(key) });
    } else {
      logger.warn('[Push] FCM enabled but no credential found (set FCM_CREDENTIAL_PATH or GOOGLE_APPLICATION_CREDENTIALS)');
      initialized = true;
      return false;
    }
    messaging = admin.messaging();
    initialized = true;
    logger.info('[Push] FCM initialized');
    return true;
  } catch (err) {
    logger.error('[Push] FCM init error:', err.message);
    initialized = true;
    return false;
  }
}

/**
 * 단일 디바이스 토큰으로 푸시 발송
 * @param {string} token - FCM 디바이스 토큰
 * @param {object} payload - { title, body, data? }
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendToToken(token, payload) {
  const logger = getLogger();
  if (!token || typeof token !== 'string' || !token.trim()) {
    return { success: false, error: 'empty token' };
  }
  if (!messaging) {
    logger.warn('[Push] FCM not available, skip send:', payload?.title);
    return { success: false, error: 'FCM not available' };
  }
  const data = payload.data || {};
  const dataStr = {};
  for (const [k, v] of Object.entries(data)) {
    dataStr[k] = typeof v === 'string' ? v : String(v);
  }
  const message = {
    notification: {
      title: payload.title || '톡테일',
      body: payload.body || '',
    },
    data: dataStr,
    token: token.trim(),
    android: {
      priority: 'high',
      notification: { sound: 'default', channelId: 'background' },
    },
    apns: {
      payload: { aps: { sound: 'default', contentAvailable: true } },
      fcmOptions: {},
    },
  };
  try {
    const messageId = await messaging.send(message);
    logger.info('[Push] Sent:', payload.title, '->', messageId);
    return { success: true, messageId };
  } catch (err) {
    logger.error('[Push] Send error:', err.code || err.message, payload?.title);
    return { success: false, error: err.code || err.message };
  }
}

/**
 * FCM 사용 가능 여부
 */
function isAvailable() {
  return !!messaging;
}

module.exports = {
  init,
  sendToToken,
  isAvailable,
};
