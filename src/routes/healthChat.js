/**
 * 건강 질문 도우미 (Google AI, 대화 기록 지원)
 * POST /api/health-chat
 * Body: { message: string } 또는 { messages: Array<{ type: 'user'|'assistant', content: string }> }
 * - messages 사용 시: 전체 대화를 보내면 이전 맥락을 반영해 이어서 답변합니다.
 * Response: { success: boolean, message: string }
 */
const express = require('express');
const { verifyToken } = require('../middlewares/auth');
const { askHealthAI } = require('../services/healthAiService');
const logger = require('../utils/logger');

const router = express.Router();
router.use(verifyToken);

const SAFE_CLIENT_MESSAGE = '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

function isHealthAiError(err) {
  return err && typeof err === 'object' && typeof err.code === 'string' && typeof err.message === 'string';
}

router.get('/', (req, res) => {
  res.json({ success: true, message: '건강 질문 도우미 API (POST로 message 또는 messages를 보내주세요)' });
});

router.post('/', async (req, res) => {
  const rawMessages = req.body?.messages;
  const rawMessage = req.body?.message;

  let message;
  let history = [];

  if (Array.isArray(rawMessages) && rawMessages.length > 0) {
    const last = rawMessages[rawMessages.length - 1];
    const lastContent = last && typeof last.content === 'string' ? last.content.trim() : '';
    const lastType = last && (last.type === 'user' || last.type === 'assistant') ? last.type : 'user';
    if (lastType !== 'user' || !lastContent) {
      return res.status(400).json({
        success: false,
        message: 'messages의 마지막 항목은 사용자(user) 메시지여야 합니다.',
      });
    }
    message = lastContent;
    history = rawMessages.slice(0, -1).map((m) => ({
      role: m && (m.type === 'user' || m.type === 'assistant') ? m.type : 'user',
      content: m && typeof m.content === 'string' ? m.content : '',
    })).filter((m) => m.content.length > 0);
  } else if (typeof rawMessage === 'string') {
    message = rawMessage.trim();
  } else {
    return res.status(400).json({
      success: false,
      message: 'message는 문자열이어야 하거나, messages 배열을 보내주세요.',
    });
  }

  if (!message) {
    return res.status(400).json({
      success: false,
      message: 'message를 입력해 주세요.',
    });
  }

  try {
    const reply = await askHealthAI(message, history.length > 0 ? history : null);
    return res.json({
      success: true,
      message: reply || '',
    });
  } catch (err) {
    let statusCode = isHealthAiError(err) && err.statusCode >= 400 ? err.statusCode : 500;
    if (statusCode === 401 || statusCode === 403) {
      statusCode = 502;
    }
    const safeMessage =
      statusCode === 400 && isHealthAiError(err) ? err.message : SAFE_CLIENT_MESSAGE;
    const isDev = process.env.NODE_ENV !== 'production';

    logger.error('[health-chat] AI 요청 실패', {
      code: isHealthAiError(err) ? err.code : 'UNKNOWN',
      statusCode,
      message: err?.message ?? String(err),
    });

    return res.status(statusCode).json({
      success: false,
      message: safeMessage,
      ...(isDev && { debug: { code: isHealthAiError(err) ? err.code : 'UNKNOWN', serverMessage: err?.message ?? String(err) } }),
    });
  }
});

module.exports = router;
