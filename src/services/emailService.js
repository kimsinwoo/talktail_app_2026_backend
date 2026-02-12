/**
 * 이메일 발송 (비밀번호 재설정 코드 등)
 * config.email.enabled 및 SMTP 설정 시에만 발송
 */
const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { email } = config;
  if (!email || !email.enabled || !email.host || !email.user) return null;
  try {
    transporter = nodemailer.createTransport({
      host: email.host,
      port: email.port || 587,
      secure: email.secure || false,
      auth: {
        user: email.user,
        pass: email.password,
      },
    });
    return transporter;
  } catch (err) {
    return null;
  }
}

/**
 * 비밀번호 재설정 코드 이메일 발송
 * @param {string} to - 수신 이메일
 * @param {string} code - 6자리 코드
 * @returns {Promise<boolean>} 발송 성공 여부
 */
async function sendPasswordResetEmail(to, code) {
  const trans = getTransporter();
  if (!trans) return false;
  const from = config.email?.from || 'noreply@talktail.com';
  try {
    await trans.sendMail({
      from: `Talktail <${from}>`,
      to,
      subject: '[Talktail] 비밀번호 재설정 인증 코드',
      text: `비밀번호 재설정 인증 코드입니다: ${code}\n\n유효 시간: 10분\n\n본인이 요청한 것이 아니라면 이 메일을 무시해 주세요.`,
      html: `<p>비밀번호 재설정 인증 코드입니다: <strong>${code}</strong></p><p>유효 시간: 10분</p><p>본인이 요청한 것이 아니라면 이 메일을 무시해 주세요.</p>`,
    });
    return true;
  } catch (err) {
    console.error('[Email] send error:', err.message);
    return false;
  }
}

/**
 * 비밀번호 재설정 링크 이메일 발송 (토큰 기반, DB 저장용)
 * @param {string} to - 수신 이메일
 * @param {string} resetToken - 재설정 토큰 (URL에 포함)
 * @param {number} expiresInMinutes - 유효 시간(분)
 * @returns {Promise<boolean>}
 */
async function sendPasswordResetLink(to, resetToken, expiresInMinutes = 15) {
  const trans = getTransporter();
  if (!trans) return false;
  const baseUrl = (process.env.PASSWORD_RESET_BASE_URL || '').trim() || 'https://app.talktail.com';
  const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;
  const from = config.email?.from || 'noreply@talktail.com';
  try {
    await trans.sendMail({
      from: `Talktail <${from}>`,
      to,
      subject: '[Talktail] 비밀번호 재설정 링크',
      text: `비밀번호 재설정을 요청하셨습니다. 아래 링크를 클릭하여 새 비밀번호를 설정해 주세요.\n\n${resetUrl}\n\n유효 시간: ${expiresInMinutes}분\n본인이 요청한 것이 아니라면 이 메일을 무시해 주세요.`,
      html: `<p>비밀번호 재설정을 요청하셨습니다. 아래 링크를 클릭하여 새 비밀번호를 설정해 주세요.</p><p><a href="${resetUrl}">비밀번호 재설정하기</a></p><p>유효 시간: ${expiresInMinutes}분</p><p>본인이 요청한 것이 아니라면 이 메일을 무시해 주세요.</p>`,
    });
    return true;
  } catch (err) {
    console.error('[Email] send error:', err.message);
    return false;
  }
}

function isEmailConfigured() {
  return !!getTransporter();
}

module.exports = {
  sendPasswordResetEmail,
  sendPasswordResetLink,
  isEmailConfigured,
};
