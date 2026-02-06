const express = require('express');
const db = require('../models');
const { verifyToken } = require('../middlewares/auth');
const { AppError } = require('../middlewares/errorHandler');

const router = express.Router();
router.use(verifyToken);

router.get('/summary', async (req, res, next) => {
  try {
    const petCodesStr = req.query.petCodes;
    if (!petCodesStr) return res.json({ success: true, data: {} });
    const petCodes = petCodesStr.split(',').map((s) => s.trim()).filter(Boolean);
    if (petCodes.length === 0) return res.json({ success: true, data: {} });

    const email = req.user.email;
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const startStr = sevenDaysAgo.toISOString().slice(0, 10);

    const [dailyChecks, diariesToday, trendRecords, lastDiaryRows] = await Promise.all([
      db.DailyCheck.findAll({ where: { user_email: email, pet_code: petCodes, date: today }, raw: true }),
      db.Diary.findAll({ where: { user_email: email, pet_code: petCodes, date: today }, attributes: ['pet_code', 'title', 'content', 'date'], raw: true }),
      db.DailyCheck.findAll({
        where: { user_email: email, pet_code: petCodes, date: { [db.Sequelize.Op.between]: [startStr, today] } },
        order: [['date', 'DESC']],
        raw: true,
      }),
      db.Diary.findAll({
        where: { user_email: email, pet_code: petCodes },
        attributes: ['pet_code', 'date'],
        order: [['date', 'DESC']],
        raw: true,
      }),
    ]);

    const checkByPet = {};
    dailyChecks.forEach((c) => { checkByPet[c.pet_code] = c; });
    const diaryByPet = {};
    diariesToday.forEach((d) => { diaryByPet[d.pet_code] = d; });
    const trendByPet = {};
    trendRecords.forEach((r) => {
      if (!trendByPet[r.pet_code]) trendByPet[r.pet_code] = [];
      trendByPet[r.pet_code].push(r);
    });
    const lastDateByPet = {};
    lastDiaryRows.forEach((r) => { if (lastDateByPet[r.pet_code] == null) lastDateByPet[r.pet_code] = r.date; });

    const summary = {};
    petCodes.forEach((code) => {
      const dc = checkByPet[code];
      const completed = !!dc;
      let completedAt = null;
      if (dc && dc.updatedAt) {
        const u = new Date(dc.updatedAt);
        completedAt = u.getHours() < 12 ? `오전 ${u.getHours() % 12 || 12}시` : `오후 ${u.getHours() % 12 || 12}시`;
      }
      const diary = diaryByPet[code];
      const hasToday = !!diary;
      const preview = diary ? (diary.title || (diary.content || '').slice(0, 50)) : null;
      const lastDate = diary ? diary.date : (lastDateByPet[code] || null);

      const trendList = trendByPet[code] || [];
      let message = '';
      const days = trendList.length;
      if (days > 0) {
        const mealLess = trendList.filter((r) => r.meal === 'less' || r.meal === 'little').length;
        const activityLess = trendList.filter((r) => r.activity === 'less' || r.activity === 'much_less').length;
        const poopDiff = trendList.filter((r) => r.poop === 'slightly' || r.poop === 'different').length;
        const badCond = trendList.filter((r) => r.special === 'yes').length;
        if (mealLess >= 3) message = `최근 ${days}일간 식사량이 평소보다 적은 날이 있어요`;
        else if (activityLess >= 3) message = '산책량이 줄어든 날이 자주 보여요';
        else if (poopDiff >= 2) message = `배변 상태가 평소와 다른 날이 ${poopDiff}일 있었어요`;
        else if (badCond > 0) message = `컨디션이 안 좋아 보인 날이 ${badCond}일 있었어요`;
        else message = '컨디션이 안정적으로 유지되고 있어요';
      }

      summary[code] = {
        dailyCheck: { completed, completedAt },
        diary: { hasToday, lastDate, preview },
        recentTrend: { message, days },
      };
    });

    res.json({ success: true, data: summary });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
