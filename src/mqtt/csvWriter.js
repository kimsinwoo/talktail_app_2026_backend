/**
 * MQTT 수신 데이터를 일별 CSV로 저장 (데이터 손실 없이 모두 기록)
 * - 파일명: YYYY-MM-DD.csv
 * - 이미 존재하면 append, 새 날짜면 새 파일
 * - 헤더: timestamp,device_id,value1,value2,value3,...
 */

const fs = require('fs');
const path = require('path');

const HEADER = 'timestamp,device_id,value1,value2,value3,value4,value5,value6';
const MAX_VALUES = 6;

/** 날짜 문자열에서 YYYY-MM-DD 추출 (예: "2026-02-04 13:25:25" -> "2026-02-04") */
function getDateKey(timestampStr) {
  if (!timestampStr || typeof timestampStr !== 'string') {
    return new Date().toISOString().slice(0, 10);
  }
  const part = timestampStr.trim().split(' ')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(part)) return part;
  return new Date().toISOString().slice(0, 10);
}

/** CSV 한 행 생성 (필드 내 쉼표/줄바꿈 이스케이프) */
function escapeCsvField(str) {
  if (str == null) return '';
  const s = String(str);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** 이미 헤더를 쓴 파일 목록 (프로세스 내) */
const filesWithHeader = new Set();

/**
 * CSV 디렉터리 확인 및 경로 반환
 * @param {string} csvDir - CSV 저장 루트 디렉터리
 * @param {string} dateKey - YYYY-MM-DD
 * @returns {string} 절대 경로
 */
function getCsvPath(csvDir, dateKey) {
  const dir = path.isAbsolute(csvDir) ? csvDir : path.join(process.cwd(), csvDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, `${dateKey}.csv`);
}

/**
 * 한 행을 해당 일자 CSV에 append
 * @param {string} csvDir - CSV 저장 디렉터리
 * @param {string} dateKey - YYYY-MM-DD
 * @param {string} timestamp - 기록용 타임스탬프
 * @param {string} deviceId - 디바이스 ID
 * @param {string[]} values - 값 배열 (최대 6개, 부족하면 빈칸)
 */
function appendRow(csvDir, dateKey, timestamp, deviceId, values) {
  const filePath = getCsvPath(csvDir, dateKey);
  const isNewFile = !fs.existsSync(filePath);

  const valueParts = [];
  for (let i = 0; i < MAX_VALUES; i++) {
    valueParts.push(escapeCsvField(values[i] != null ? values[i] : ''));
  }
  const line = [escapeCsvField(timestamp), escapeCsvField(deviceId), ...valueParts].join(',') + '\n';

  if (isNewFile || !filesWithHeader.has(filePath)) {
    fs.appendFileSync(filePath, HEADER + '\n', 'utf8');
    filesWithHeader.add(filePath);
  }
  fs.appendFileSync(filePath, line, 'utf8');
}

module.exports = {
  getDateKey,
  appendRow,
  getCsvPath,
  HEADER,
  MAX_VALUES,
};
