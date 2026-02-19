const express = require('express');
const db = require('../models');
const { verifyToken } = require('../middlewares/auth');
const { AppError } = require('../middlewares/errorHandler');
const { matchByChosungOrText } = require('../utils/chosung');

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res, next) => {
  try {
    const { petCode, page = '1', limit = '20' } = req.query;
    if (!petCode) throw new AppError('petCode 필요', 400);
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;
    const { count, rows } = await db.Diary.findAndCountAll({
      where: { user_email: req.user.email, pet_code: petCode },
      order: [['date', 'DESC']],
      limit: limitNum,
      offset,
      raw: true,
    });
    const list = rows.map((d) => ({
      id: d.id,
      date: d.date,
      title: d.title,
      content: d.content,
      mood: d.mood,
      weather: d.weather,
      activities: d.activities || [],
      photos: d.photos || [],
      checkpoints: d.checkpoints || [],
    }));
    res.json({
      success: true,
      data: { list, pagination: { page: pageNum, limit: limitNum, total: count, totalPages: Math.ceil(count / limitNum) } },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/today', async (req, res, next) => {
  try {
    const { petCode } = req.query;
    if (!petCode) throw new AppError('petCode 필요', 400);
    const today = new Date().toISOString().slice(0, 10);
    const entry = await db.Diary.findOne({
      where: { user_email: req.user.email, pet_code: petCode, date: today },
      raw: true,
    });
    if (!entry) {
      const last = await db.Diary.findOne({
        where: { user_email: req.user.email, pet_code: petCode },
        order: [['date', 'DESC']],
        attributes: ['date'],
        raw: true,
      });
      return res.json({ success: true, data: { hasToday: false, lastDate: last ? last.date : null, preview: null, id: null } });
    }
    const preview = entry.content && entry.content.length > 50 ? entry.content.slice(0, 50) + '...' : (entry.content || '');
    res.json({
      success: true,
      data: { hasToday: true, lastDate: entry.date, preview: entry.title || preview, id: entry.id },
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
    const rows = await db.Diary.findAll({
      where: {
        user_email: req.user.email,
        pet_code: petCode,
        date: { [db.Sequelize.Op.between]: [startStr, endStr] },
      },
      attributes: ['date'],
      raw: true,
    });
    res.json({ success: true, data: rows.map((r) => r.date) });
  } catch (e) {
    next(e);
  }
});

/**
 * 일기 검색: 키워드(자음 검색 지원), 날짜 필터
 * GET /api/diaries/search?petCode=xxx&keyword=xxx&date=yyyy-mm-dd
 * - keyword: 선택. 제목/내용 검색. 자음만 입력 시 초성 매칭 (예: ㄱㅅ → 간식, 강아지 등)
 * - date: 선택. 해당 날짜 일기만
 */
router.get('/search', async (req, res, next) => {
  try {
    const { petCode, keyword, date } = req.query;
    if (!petCode) throw new AppError('petCode 필요', 400);

    const where = {
      user_email: req.user.email,
      pet_code: petCode,
    };
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      where.date = date;
    }

    const rows = await db.Diary.findAll({
      where,
      order: [['date', 'DESC']],
      raw: true,
    });

    let list = rows.map((d) => ({
      id: d.id,
      date: d.date,
      title: d.title,
      content: d.content,
      mood: d.mood,
      weather: d.weather,
      activities: d.activities || [],
      photos: d.photos || [],
      checkpoints: d.checkpoints || [],
    }));

    const keywordTrimmed = typeof keyword === 'string' ? keyword.trim() : '';
    if (keywordTrimmed.length > 0) {
      list = list.filter((d) => {
        const text = (d.title || '') + ' ' + (d.content || '');
        return matchByChosungOrText(text, keywordTrimmed);
      });
    }

    res.json({
      success: true,
      data: {
        list,
        keyword: keywordTrimmed,
        date: date || null,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new AppError('유효하지 않은 ID', 400);
    const entry = await db.Diary.findOne({ where: { id, user_email: req.user.email } });
    if (!entry) throw new AppError('일기를 찾을 수 없습니다.', 404);
    res.json({
      success: true,
      data: {
        id: entry.id,
        pet_code: entry.pet_code,
        date: entry.date,
        title: entry.title,
        content: entry.content,
        mood: entry.mood,
        weather: entry.weather,
        activities: entry.activities || [],
        photos: entry.photos || [],
        checkpoints: entry.checkpoints || [],
      },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    console.log("req.body : ", req.body);
    const { petCode, date, title, content, mood, weather, activities, photos, checkpoints } = req.body;
    if (!petCode || !date || !title || !content || !mood || !weather) throw new AppError('petCode, date, title, content, mood, weather 필수', 400);
    const email = req.user.email;
    const payload = {
      title: String(title).slice(0, 100),
      content,
      mood: mood === 'happy' || mood === 'neutral' || mood === 'sad' ? mood : 'neutral',
      weather: weather === 'sunny' || weather === 'cloudy' || weather === 'rainy' ? weather : 'sunny',
      activities: Array.isArray(activities) ? activities : [],
      photos: Array.isArray(photos) ? photos : [],
      checkpoints: Array.isArray(checkpoints) ? checkpoints : [],
    };
    let row = await db.Diary.findOne({ where: { user_email: email, pet_code: petCode, date } });
    if (row) await row.update(payload);
    else row = await db.Diary.create({ user_email: email, pet_code: petCode, date, ...payload });
    res.status(201).json({
      success: true,
      data: {
        id: row.id,
        date: row.date,
        title: row.title,
        content: row.content,
        mood: row.mood,
        weather: row.weather,
        activities: row.activities || [],
        photos: row.photos || [],
        checkpoints: row.checkpoints || [],
      },
    });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new AppError('유효하지 않은 ID', 400);
    const { title, content, mood, weather, activities, photos, checkpoints } = req.body;
    const entry = await db.Diary.findOne({ where: { id, user_email: req.user.email } });
    if (!entry) throw new AppError('일기를 찾을 수 없습니다.', 404);
    const updates = {};
    if (title != null) updates.title = String(title).slice(0, 100);
    if (content != null) updates.content = content;
    if (mood != null && ['happy', 'neutral', 'sad'].includes(mood)) updates.mood = mood;
    if (weather != null && ['sunny', 'cloudy', 'rainy'].includes(weather)) updates.weather = weather;
    if (Array.isArray(activities)) updates.activities = activities;
    if (Array.isArray(photos)) updates.photos = photos;
    if (Array.isArray(checkpoints)) updates.checkpoints = checkpoints;
    await entry.update(updates);
    res.json({
      success: true,
      data: {
        id: entry.id,
        date: entry.date,
        title: entry.title,
        content: entry.content,
        mood: entry.mood,
        weather: entry.weather,
        activities: entry.activities || [],
        photos: entry.photos || [],
        checkpoints: entry.checkpoints || [],
      },
    });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) throw new AppError('유효하지 않은 ID', 400);
    const n = await db.Diary.destroy({ where: { id, user_email: req.user.email } });
    if (!n) throw new AppError('일기를 찾을 수 없습니다.', 404);
    res.json({ success: true, data: { id } });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
