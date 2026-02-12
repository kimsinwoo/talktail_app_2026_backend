/**
 * 사용자별 BLE 디바이스 바인딩 (메모리 저장)
 * 서버 재시작 시 초기화됨. 필요 시 DB 모델로 교체 가능.
 */
const store = new Map(); // user_email -> { peripheralId, platform }

function set(email, peripheralId, platform) {
  if (!email || !peripheralId) return;
  store.set(String(email).toLowerCase(), {
    peripheralId: String(peripheralId),
    platform: platform || 'ios',
  });
}

function get(email) {
  if (!email) return null;
  return store.get(String(email).toLowerCase()) || null;
}

module.exports = { set, get };
