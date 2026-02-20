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
        completedAt = dc.updatedAt; // 원본 날짜를 그대로 전송
      }
      const diary = diaryByPet[code];
      const hasToday = !!diary;
      const preview = diary ? (diary.title || (diary.content || '').slice(0, 50)) : null;
      const lastDate = diary ? diary.date : (lastDateByPet[code] || null);

      const trendList = trendByPet[code] || [];
      const days = trendList.length;

      // 오늘 상태: 알고리즘으로 한 문장 요약
      let message = '';
      let todayCheck = null;
      if (dc) {
        const meal = dc.meal || 'good';
        const water = dc.water || 'normal';
        const activity = dc.activity || 'similar';
        const special = dc.special || 'none';
        const poop = dc.poop || 'normal';
        todayCheck = { meal, water, activity, condition: special === 'none' ? 'good' : special === 'some' ? 'normal' : 'bad', poop };
        const mealLow = meal === 'less' || meal === 'little';
        const waterLow = water === 'less';
        const activityLow = activity === 'less' || activity === 'much_less';
        const poopDiff = poop === 'slightly' || poop === 'different';
        const condBad = special === 'some' || special === 'yes';
        const concernCount = [mealLow, waterLow, activityLow, poopDiff, condBad].filter(Boolean).length;

        if (concernCount === 0) message = '오늘 무난해 보여요';
        else if (condBad && concernCount >= 2) message = '오늘 컨디션이 조금 다르게 보여요';
        else if (condBad) message = '컨디션이 평소와 조금 달라 보여요';
        else if (mealLow && waterLow) message = '식사·음수가 평소보다 적어요';
        else if (mealLow) message = '식사가 평소보다 조금 적어요';
        else if (waterLow) message = '음수가 평소보다 적어요';
        else if (activityLow) message = '활동이 평소보다 조금 적어요';
        else if (poopDiff) message = '배변이 평소와 달라 보여요';
        else message = '오늘 평소와 다른 점이 있어요';
      }

      // 오늘 없을 때: 최근 7일 트렌드로 한 문장
      if (!message && days > 0) {
        const mealLess = trendList.filter((r) => r.meal === 'less' || r.meal === 'little').length;
        const waterLess = trendList.filter((r) => r.water === 'less').length;
        const activityLess = trendList.filter((r) => r.activity === 'less' || r.activity === 'much_less').length;
        const poopDiff = trendList.filter((r) => r.poop === 'slightly' || r.poop === 'different').length;
        const badCond = trendList.filter((r) => r.special === 'yes').length;
        const hasMeal = mealLess >= 2;
        const hasWater = waterLess >= 2;
        const hasActivity = activityLess >= 2;
        const hasPoop = poopDiff >= 2;
        const hasCond = badCond > 0;
        const patternCount = [hasMeal, hasWater, hasActivity, hasPoop, hasCond].filter(Boolean).length;

        if (patternCount === 0) message = '최근 흐름이 안정적이에요';
        else if (patternCount >= 2) message = '최근에 패턴이 조금 보여요';
        else if (hasCond) message = '컨디션이 달라진 날이 있어요';
        else if (hasMeal) message = '식사가 적은 날이 있어요';
        else if (hasWater) message = '음수가 적은 날이 있어요';
        else if (hasActivity) message = '활동이 줄어든 날이 있어요';
        else if (hasPoop) message = '배변이 달랐던 날이 있어요';
        else message = '최근 흐름이 안정적이에요';
      }

      summary[code] = {
        dailyCheck: { completed, completedAt },
        diary: { hasToday, lastDate, preview },
        recentTrend: { message, days },
        todayCheck: todayCheck || undefined,
      };
    });

    res.json({ success: true, data: summary });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
