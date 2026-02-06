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

function isEmailConfigured() {
  return !!getTransporter();
}

module.exports = {
  sendPasswordResetEmail,
  isEmailConfigured,
};
