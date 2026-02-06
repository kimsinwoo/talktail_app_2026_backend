/**
 * 일기/상태 체크 미완료 리마인더 푸시 알림 스케줄 잡
 * - 오늘 일기 미완료 → 일기 알림 (같은 항목은 2시간에 한 번만)
 * - 오늘 상태 체크 미완료 → 상태 체크 알림 (같은 항목은 2시간에 한 번만)
 * - 완료했으면 해당 항목 알림 안 보냄
 */
const db = require('../models');
const pushService = require('../services/pushService');

function getLogger() {
  try {
    return require('../utils/logger');
  } catch {
    return { info: console.log, warn: console.warn, error: console.error };
  }
}

const REMINDER_COOLDOWN_MS = parseInt(process.env.PUSH_REMINDER_COOLDOWN_MS || '7200000', 10); // 2시간

/**
 * 오늘 날짜 문자열 (YYYY-MM-DD)
 */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 사용자별 오늘 일기 작성 여부 (해당 유저의 어떤 펫이든 오늘 일기 하나라도 있으면 true)
 */
async function hasDiaryToday(userEmail) {
  const today = todayStr();
  const count = await db.Diary.count({
    where: { user_email: userEmail, date: today },
  });
  return count > 0;
}

/**
 * 사용자별 오늘 상태 체크 여부 (해당 유저의 어떤 펫이든 오늘 체크 하나라도 있으면 true)
 */
async function hasDailyCheckToday(userEmail) {
  const today = todayStr();
  const count = await db.DailyCheck.count({
    where: { user_email: userEmail, date: today },
  });
  return count > 0;
}

/**
 * 2시간 쿨다운 통과 여부
 */
function canSendReminder(lastSentAt) {
  if (!lastSentAt) return true;
  const elapsed = Date.now() - new Date(lastSentAt).getTime();
  return elapsed >= REMINDER_COOLDOWN_MS;
}

/**
 * 리마인더 푸시 한 번 실행
 */
async function run() {
  const logger = getLogger();
  logger.info('[PushReminder] Run start');
  if (!pushService.isAvailable()) {
    logger.warn('[PushReminder] FCM not available, skip');
    return;
  }
  const today = todayStr();
  const users = await db.User.findAll({
    where: {
      status: 'ACTIVE',
      fcm_token: { [db.Sequelize.Op.ne]: null },
    },
    attributes: ['email', 'name', 'fcm_token', 'push_reminder_diary_sent_at', 'push_reminder_daily_check_sent_at'],
    raw: true,
  });
  let sentDiary = 0;
  let sentDailyCheck = 0;
  for (const u of users) {
    const token = u.fcm_token && u.fcm_token.trim();
    if (!token) continue;
    try {
      // 일기 미완료 && 2시간 쿨다운 통과 → 일기 리마인더
      const diaryDone = await hasDiaryToday(u.email);
      if (!diaryDone && canSendReminder(u.push_reminder_diary_sent_at)) {
        const res = await pushService.sendToToken(token, {
          title: '오늘의 일기',
          body: '오늘 반려동물 일기를 아직 작성하지 않았어요. 기록해 보세요.',
          data: { type: 'reminder_diary', date: today },
        });
        if (res.success) {
          await db.User.update(
            { push_reminder_diary_sent_at: new Date() },
            { where: { email: u.email } }
          );
          sentDiary += 1;
        }
      }
      // 상태 체크 미완료 && 2시간 쿨다운 통과 → 상태 체크 리마인더
      const checkDone = await hasDailyCheckToday(u.email);
      if (!checkDone && canSendReminder(u.push_reminder_daily_check_sent_at)) {
        const res = await pushService.sendToToken(token, {
          title: '오늘의 상태 체크',
          body: '오늘 반려동물 상태 체크를 아직 하지 않았어요. 확인해 주세요.',
          data: { type: 'reminder_daily_check', date: today },
        });
        if (res.success) {
          await db.User.update(
            { push_reminder_daily_check_sent_at: new Date() },
            { where: { email: u.email } }
          );
          sentDailyCheck += 1;
        }
      }
    } catch (err) {
      logger.error('[PushReminder] User', u.email, err.message);
    }
  }
  logger.info('[PushReminder] Run done. sent diary:', sentDiary, 'daily_check:', sentDailyCheck);
}

module.exports = { run };
