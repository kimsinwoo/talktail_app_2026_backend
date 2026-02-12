/**
 * MQTT hub/{hubId}/send 수신 → backend/data/csv 에 CSV 저장
 * - CommonJS, fs.promises, 외부 CSV 라이브러리 미사용
 * - 실행: node src/scripts/mqttCsvSave.js (backend 디렉터리에서)
 */

const path = require('path');
const fs = require('fs').promises;
const mqtt = require('mqtt');

const CSV_HEADER = 'timestamp,envTemp,heartRate,respRate,bodyTemp,activity\n';
const EXPECTED_FIELDS = 5; // envTemp, heartRate, respRate, bodyTemp, activity

// backend/data/csv (스크립트 위치: backend/src/scripts/)
const CSV_BASE_DIR = path.resolve(__dirname, '../../data/csv');
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL !== undefined && process.env.MQTT_BROKER_URL !== ''
  ? process.env.MQTT_BROKER_URL
  : 'mqtt://127.0.0.1:1883';

/**
 * topic "hub/{hubId}/send" 에서 hubId 추출
 * @param {string} topic
 * @returns {string|null} hubId or null
 */
function parseHubIdFromTopic(topic) {
  if (typeof topic !== 'string') return null;
  const parts = topic.split('/');
  if (parts.length < 2) return null;
  const hubId = parts[1];
  return hubId.length > 0 ? hubId : null;
}

/**
 * 파일명용 hubId (콜론 → 하이픈)
 * @param {string} hubId
 * @returns {string}
 */
function sanitizeHubIdForFilename(hubId) {
  if (typeof hubId !== 'string') return 'unknown';
  return hubId.replace(/:/g, '-');
}

/**
 * t 문자열에서 날짜 부분 YYYY-MM-DD 추출
 * @param {string} tStr - "2026-02-06 03:39:02"
 * @returns {string|null} "2026-02-06" or null
 */
function parseDateKey(tStr) {
  if (typeof tStr !== 'string') return null;
  const trimmed = tStr.trim();
  if (trimmed.length < 10) return null;
  const datePart = trimmed.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  return datePart;
}

/**
 * d 문자열 파싱: "25.00,90,70,35.00,90" → [envTemp, heartRate, respRate, bodyTemp, activity]
 * 값 개수가 5개가 아니면 null 반환. 숫자로 명시적 변환.
 * @param {string} dStr
 * @returns {{ envTemp: number, heartRate: number, respRate: number, bodyTemp: number, activity: number }|null}
 */
function parseD(dStr) {
  if (typeof dStr !== 'string') return null;
  const parts = dStr.split(',').map((p) => p.trim());
  if (parts.length !== EXPECTED_FIELDS) return null;

  const envTemp = Number(parts[0]);
  const heartRate = Number(parts[1]);
  const respRate = Number(parts[2]);
  const bodyTemp = Number(parts[3]);
  const activity = Number(parts[4]);

  if (Number.isNaN(envTemp) || Number.isNaN(heartRate) || Number.isNaN(respRate) || Number.isNaN(bodyTemp) || Number.isNaN(activity)) {
    return null;
  }
  return { envTemp, heartRate, respRate, bodyTemp, activity };
}

/**
 * CSV 한 줄 문자열 생성 (이스케이프 없음: 숫자/타임스탬프만 가정)
 * @param {string} timestamp
 * @param {{ envTemp: number, heartRate: number, respRate: number, bodyTemp: number, activity: number }} row
 * @returns {string}
 */
function toCsvLine(timestamp, row) {
  return `${timestamp},${row.envTemp},${row.heartRate},${row.respRate},${row.bodyTemp},${row.activity}\n`;
}

/**
 * 디렉터리 존재 시 무시, 없으면 생성
 * @param {string} dirPath
 */
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

/**
 * CSV 파일 경로 반환: {csvBase}/hub_{hubId}_{YYYY-MM-DD}.csv
 * @param {string} hubId
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {string}
 */
function getCsvFilePath(hubId, dateKey) {
  const safe = sanitizeHubIdForFilename(hubId);
  const fileName = `hub_${safe}_${dateKey}.csv`;
  return path.join(CSV_BASE_DIR, fileName);
}

/**
 * 파일 존재 여부
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * CSV 파일에 헤더만 쓴 뒤 생성 (최초 1회)
 * @param {string} filePath
 */
async function createFileWithHeaderIfNeeded(filePath) {
  const exists = await fileExists(filePath);
  if (exists) return;
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, CSV_HEADER, 'utf8');
}

/**
 * CSV 파일에 행 append
 * @param {string} filePath
 * @param {string} line
 */
async function appendCsvLine(filePath, line) {
  await fs.appendFile(filePath, line, 'utf8');
}

/**
 * 페이로드(JSON) 파싱. data 배열 보장.
 * @param {Buffer|string} payload
 * @returns {{ data: Array<{ d?: string, t?: string }> }|null}
 */
function parsePayload(payload) {
  let raw;
  if (Buffer.isBuffer(payload)) {
    raw = payload.toString('utf8');
  } else if (typeof payload === 'string') {
    raw = payload;
  } else {
    return null;
  }
  try {
    const obj = JSON.parse(raw);
    if (obj === null || typeof obj !== 'object') return null;
    if (!Array.isArray(obj.data)) return null;
    return obj;
  } catch {
    return null;
  }
}

/**
 * payload가 "disconnected:mac_address" 또는 "desconnected:mac_address" 형식인지 확인
 * mac 주소는 소문자로 normalize하여 반환 (유효하지 않으면 null)
 * @param {Buffer|string} payload
 * @returns {string|null} mac_address (소문자) 또는 null
 */
function parseDisconnectedPayload(payload) {
  let raw;
  if (Buffer.isBuffer(payload)) {
    raw = payload.toString('utf8').trim();
  } else if (typeof payload === 'string') {
    raw = payload.trim();
  } else {
    return null;
  }
  let mac = null;
  if (raw.startsWith('disconnected:')) {
    mac = raw.slice('disconnected:'.length).trim();
  } else if (raw.startsWith('desconnected:')) {
    mac = raw.slice('desconnected:'.length).trim();
  }
  if (!mac || mac.length === 0) return null;
  return mac.toLowerCase();
}

/**
 * 문자열 형식 텔레메트리 파싱 (hub_project/back와 동일 형식)
 * 형식: "device_mac_address-sampling_rate,hr,spo2,temp,battery"
 * 예: "fd:b3:a4:d5:be:2b-50,50.25,8,95,0"
 * @param {Buffer|string} payload
 * @returns {{ hr: number, spo2: number, temp: number, battery: number }|null}
 */
function parseStringFormatTelemetry(payload) {
  let raw;
  if (Buffer.isBuffer(payload)) {
    raw = payload.toString('utf8').trim();
  } else if (typeof payload === 'string') {
    raw = payload.trim();
  } else {
    return null;
  }
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 5) return null;

  const head = parts[0];
  const dashIdx = head.lastIndexOf('-');
  if (dashIdx <= 0) return null;

  const hr = Number(parts[1]);
  const spo2 = Number(parts[2]);
  const temp = Number(parts[3]);
  const battery = Number(parts[4]);

  if (!Number.isFinite(hr) || !Number.isFinite(spo2) || !Number.isFinite(temp) || !Number.isFinite(battery)) {
    return null;
  }
  return {
    hr,
    spo2,
    temp,
    battery,
  };
}

/**
 * 현재 시각을 CSV용 타임스탬프 문자열로 (YYYY-MM-DD HH:mm:ss)
 */
function nowTimestamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

/**
 * 단일 메시지 처리: JSON 파싱 또는 문자열 형식 → CSV append
 * @param {string} hubId
 * @param {Buffer|string} payload
 */
async function processMessage(hubId, payload) {
  // 1) 기존 JSON 형식: { data: [ { d: "envTemp,heartRate,respRate,bodyTemp,activity", t: "timestamp" } ] }
  const parsed = parsePayload(payload);
  if (parsed !== null) {
    const rows = [];
    for (let i = 0; i < parsed.data.length; i++) {
      const item = parsed.data[i];
      if (item === null || typeof item !== 'object') continue;

      const dStr = item.d;
      const tStr = item.t;
      if (typeof dStr !== 'string' || typeof tStr !== 'string') continue;

      const dateKey = parseDateKey(tStr);
      if (dateKey === null) continue;

      const row = parseD(dStr);
      if (row === null) continue;

      rows.push({ dateKey, timestamp: tStr.trim(), row });
    }

    if (rows.length > 0) {
      for (const { dateKey, timestamp, row } of rows) {
        const filePath = getCsvFilePath(hubId, dateKey);
        try {
          await createFileWithHeaderIfNeeded(filePath);
          await appendCsvLine(filePath, toCsvLine(timestamp, row));
        } catch (err) {
          console.error('[mqttCsvSave] CSV 쓰기 실패:', filePath, err.message);
        }
      }
    }
    return;
  }

  // 2) 문자열 형식: "device_mac-sampling_rate,hr,spo2,temp,battery" → CSV 1행 추가
  const stringRow = parseStringFormatTelemetry(payload);
  if (stringRow !== null) {
    const timestamp = nowTimestamp();
    const dateKey = parseDateKey(timestamp);
    if (dateKey === null) return;
    // CSV 컬럼: timestamp, envTemp, heartRate, respRate, bodyTemp, activity
    const row = {
      envTemp: 0,
      heartRate: stringRow.hr,
      respRate: stringRow.spo2,
      bodyTemp: stringRow.temp,
      activity: stringRow.battery,
    };
    const filePath = getCsvFilePath(hubId, dateKey);
    try {
      await createFileWithHeaderIfNeeded(filePath);
      await appendCsvLine(filePath, toCsvLine(timestamp, row));
    } catch (err) {
      console.error('[mqttCsvSave] CSV 쓰기 실패 (문자열 형식):', filePath, err.message);
    }
    return;
  }
}

/**
 * MQTT 클라이언트 연결 및 hub/+/send 구독
 * @param {object} [options]
 * @param {function(string)} [options.onDisconnected] - (macAddress) 호출. disconnected:mac 수신 시, mac은 소문자
 * @returns {{ client: import('mqtt').MqttClient, stop: function }} 서버에서 종료 시 stop() 호출
 */
function run(options) {
  const opts = options || {};
  const onDisconnected = typeof opts.onDisconnected === 'function' ? opts.onDisconnected : null;

  const client = mqtt.connect(MQTT_BROKER_URL, {
    clientId: `mqtt-csv-save-${Date.now()}`,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });

  client.on('connect', () => {
    console.log('[mqttCsvSave] MQTT 연결됨:', MQTT_BROKER_URL);
    client.subscribe('hub/+/send', { qos: 1 }, (err) => {
      if (err) {
        console.error('[mqttCsvSave] 구독 실패:', err.message);
        return;
      }
      console.log('[mqttCsvSave] 구독: hub/+/send');
      console.log('[mqttCsvSave] CSV 저장 경로:', CSV_BASE_DIR);
    });
  });

  client.on('message', (topic, payload) => {
    const hubId = parseHubIdFromTopic(topic);
    if (hubId === null) return;

    const macAddress = parseDisconnectedPayload(payload);
    if (macAddress !== null) {
      console.log('[mqttCsvSave] disconnected 수신:', { hubId, macAddress });
      if (onDisconnected) {
        Promise.resolve(onDisconnected(macAddress)).catch((err) => {
          console.error('[mqttCsvSave] onDisconnected 오류:', err.message);
        });
      }
      return;
    }

    processMessage(hubId, payload).catch((err) => {
      console.error('[mqttCsvSave] 메시지 처리 오류:', err.message);
    });
  });

  client.on('error', (err) => {
    console.error('[mqttCsvSave] MQTT 에러:', err.message);
  });

  client.on('close', () => {
    console.log('[mqttCsvSave] MQTT 연결 종료');
  });

  return {
    client,
    stop() {
      if (client && typeof client.end === 'function') {
        client.end();
      }
    },
  };
}

if (require.main === module) {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  run();
}

module.exports = {
  parseHubIdFromTopic,
  sanitizeHubIdForFilename,
  parseDateKey,
  parseD,
  toCsvLine,
  getCsvFilePath,
  parsePayload,
  parseStringFormatTelemetry,
  nowTimestamp,
  processMessage,
  run,
  CSV_HEADER,
  CSV_BASE_DIR,
};
