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
 * - FCM_ENABLED=true 이거나, 서비스 계정(JSON/파일)이 있으면 시도
 * - 인증서: FCM_CREDENTIAL_JSON → 파일(FCM_CREDENTIAL_PATH/GOOGLE_APPLICATION_CREDENTIALS) → applicationDefault (GCP 환경)
 * @param {object} config - config.fcm { enabled, credentialPath }
 * @returns {boolean} 실제로 사용 가능 여부
 */
function init(config) {
  if (initialized) return !!messaging;
  const logger = getLogger();
  const explicitEnabled = config?.fcm?.enabled === true;
  const hasCredPath = !!(config?.fcm?.credentialPath || process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const hasCredJson = !!(process.env.FCM_CREDENTIAL_JSON && process.env.FCM_CREDENTIAL_JSON.trim());
  const shouldTry = explicitEnabled || hasCredPath || hasCredJson;
  if (!shouldTry) {
    logger.info('[Push] FCM disabled. 설정: .env에 FCM_ENABLED=true 와 서비스 계정(파일 경로 또는 FCM_CREDENTIAL_JSON) 추가');
    initialized = true;
    return false;
  }
  try {
    admin = require('firebase-admin');
    const fs = require('fs');
    let credential = null;

    const credJson = process.env.FCM_CREDENTIAL_JSON;
    if (credJson && typeof credJson === 'string' && credJson.trim()) {
      try {
        const key = JSON.parse(credJson);
        credential = admin.credential.cert(key);
      } catch (e) {
        logger.warn('[Push] FCM_CREDENTIAL_JSON JSON parse error');
      }
    }
    if (!credential) {
      const credPath = config?.fcm?.credentialPath || process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (credPath && credPath.trim()) {
        const candidates = [
          path.resolve(credPath.trim()),
          path.resolve(process.cwd(), credPath.trim()),
          path.resolve(__dirname, '..', '..', credPath.trim()),
        ].filter((p, i, arr) => arr.indexOf(p) === i);
        for (const resolvedPath of candidates) {
          if (fs.existsSync(resolvedPath)) {
            const key = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
            credential = admin.credential.cert(key);
            break;
          }
        }
      }
    }
    if (!credential) {
      try {
        credential = admin.credential.applicationDefault();
      } catch (e) {
        logger.info('[Push] applicationDefault 실패 (GCP 외 환경에서는 정상):', e.message);
      }
    }
    if (!credential) {
      logger.warn('[Push] FCM 인증서 없음. .env 예: FCM_ENABLED=true, GOOGLE_APPLICATION_CREDENTIALS=./서비스계정.json 또는 FCM_CREDENTIAL_JSON');
      initialized = true;
      return false;
    }
    admin.initializeApp({ credential });
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
      title: payload.title || 'TalkTail',
      body: payload.body || '',
    },
    data: dataStr,
    token: token.trim(),
    android: {
      priority: 'high',
      notification: { sound: 'default', channelId: 'background' },
    },
    apns: {
      headers: { 'apns-priority': '10' },
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
