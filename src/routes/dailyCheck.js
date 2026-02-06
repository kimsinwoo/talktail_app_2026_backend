const express = require('express');
const db = require('../models');
const { verifyToken } = require('../middlewares/auth');
const { AppError } = require('../middlewares/errorHandler');

const router = express.Router();
router.use(verifyToken);

router.get('/today', async (req, res, next) => {
  try {
    const { petCode } = req.query;
    if (!petCode) throw new AppError('petCode가 필요합니다.', 400);
    const today = new Date().toISOString().slice(0, 10);
    const record = await db.DailyCheck.findOne({
      where: { user_email: req.user.email, pet_code: petCode, date: today },
    });
    if (!record) {
      return res.json({ success: true, data: { completed: false, completedAt: null, record: null } });
    }
    const u = record.updatedAt ? new Date(record.updatedAt) : null;
    const completedAt = u ? (u.getHours() < 12 ? `오전 ${u.getHours() % 12 || 12}시` : `오후 ${u.getHours() % 12 || 12}시`) : null;
    res.json({
      success: true,
      data: {
        completed: true,
        completedAt,
        record: {
          id: record.id,
          date: record.date,
          meal: record.meal,
          water: record.water,
          activity: record.activity,
          sleep: record.sleep,
          poop: record.poop,
          special: record.special,
          special_note: record.special_note,
          poop_note: record.poop_note,
        },
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/calendar-dates', async (req, res, next) => {
  try {
    const { petCode, year, month } = req.query;
    if (!petCode || !year || !month) throw new AppError('petCode, year, month 필요', 400);
    const y = parseInt(year, 10);
    const m = parseInt(month, 10) - 1;
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const startStr = first.toISOString().slice(0, 10);
    const endStr = last.toISOString().slice(0, 10);
    const rows = await db.DailyCheck.findAll({
      where: {
        user_email: req.user.email,
        pet_code: petCode,
        date: { [db.Sequelize.Op.between]: [startStr, endStr] },
      },
      attributes: ['date', 'special_note', 'poop_note'],
      raw: true,
    });
    const checkDates = rows.map((r) => r.date);
    const specialNotes = rows
      .filter((r) => {
        const hasSpecial = r.special_note && String(r.special_note).trim();
        const hasPoop = r.poop_note && String(r.poop_note).trim();
        return hasSpecial || hasPoop;
      })
      .map((r) => {
        const parts = [];
        if (r.special_note && String(r.special_note).trim()) parts.push(String(r.special_note).trim());
        if (r.poop_note && String(r.poop_note).trim()) parts.push(`배변: ${String(r.poop_note).trim()}`);
        return { date: r.date, specialNote: parts.join(' / ') };
      });
    res.json({ success: true, data: { checkDates, specialNotes } });
  } catch (e) {
    next(e);
  }
});

router.get('/trend', async (req, res, next) => {
  try {
    const petCode = req.query.petCode;
    const days = Math.min(parseInt(req.query.days || '7', 10), 90);
    if (!petCode) throw new AppError('petCode 필요', 400);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const records = await db.DailyCheck.findAll({
      where: {
        user_email: req.user.email,
        pet_code: petCode,
        date: { [db.Sequelize.Op.between]: [startStr, endStr] },
      },
      order: [['date', 'DESC']],
      raw: true,
    });
    const list = records.map((r) => ({
      date: r.date,
      meal: r.meal || 'good',
      water: r.water || 'normal',
      poop: r.poop || 'normal',
      activity: r.activity || 'similar',
      condition: r.special === 'none' ? 'good' : r.special === 'some' ? 'normal' : r.special === 'yes' ? 'bad' : 'normal',
      specialNote: r.special_note || (r.poop_note ? `배변: ${r.poop_note}` : undefined),
    }));
    res.json({ success: true, data: list });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { petCode, date, meal, water, activity, sleep, poop, special, special_note, poop_note } = req.body;
    if (!petCode) throw new AppError('petCode 필요', 400);
    const checkDate = date || new Date().toISOString().slice(0, 10);
    const email = req.user.email;
    let row = await db.DailyCheck.findOne({
      where: { user_email: email, pet_code: petCode, date: checkDate },
    });
    const payload = { meal, water, activity, sleep, poop, special, special_note, poop_note };
    if (row) await row.update(payload);
    else row = await db.DailyCheck.create({ user_email: email, pet_code: petCode, date: checkDate, ...payload });
    res.status(201).json({
      success: true,
      data: {
        id: row.id,
        date: row.date,
        meal: row.meal,
        water: row.water,
        activity: row.activity,
        sleep: row.sleep,
        poop: row.poop,
        special: row.special,
        special_note: row.special_note,
        poop_note: row.poop_note,
      },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
