/**
 * BLE 디바이스 바인딩 (앱 ↔ 백엔드)
 * POST /api/ble/bind - 바인딩 저장
 * POST /api/ble/bind/load - 바인딩 조회
 */
const express = require('express');
const { verifyToken } = require('../middlewares/auth');
const bleBindStore = require('../utils/bleBindStore');

const router = express.Router();
router.use(verifyToken);

router.post('/bind', (req, res) => {
  const peripheralId = req.body?.peripheralId;
  const platform = req.body?.platform || 'ios';
  if (!peripheralId || typeof peripheralId !== 'string') {
    return res.status(400).json({ success: false, message: 'peripheralId가 필요합니다.' });
  }
  bleBindStore.set(req.user.email, peripheralId.trim(), platform);
  return res.json({ success: true, message: '저장되었습니다.' });
});

router.post('/bind/load', (req, res) => {
  const binding = bleBindStore.get(req.user.email);
  return res.json({
    success: true,
    peripheralId: binding?.peripheralId ?? null,
  });
});

module.exports = router;
