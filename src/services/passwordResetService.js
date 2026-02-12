/**
 * Secure password reset: token stored hashed in DB, with expiry and attempt limit.
 */

const crypto = require('crypto');
const db = require('../models');

const TOKEN_EXPIRY_MINUTES = 15;
const MAX_ATTEMPTS = 5;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a reset token for the user. Store only hash in DB.
 * @param {string} userId - User email
 * @returns {{ token: string, expiresAt: Date }} Plain token to send in email link; expiresAt
 */
async function createResetToken(userId) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  await db.PasswordResetToken.create({
    userId,
    tokenHash,
    expiresAt,
    attemptCount: 0,
    maxAttempts: MAX_ATTEMPTS,
  });

  return { token, expiresAt };
}

/**
 * Validate and consume a reset token. Increments attempt count. On success sets usedAt.
 * @param {string} token - Plain token from email
 * @returns {Promise<string|null>} userId (email) if valid and consumed, else null
 */
async function consumeResetToken(token) {
  const tokenHash = hashToken(token);
  const record = await db.PasswordResetToken.findOne({
    where: { tokenHash },
    include: [{ model: db.User, as: 'User', attributes: ['email'] }],
  });

  if (!record) return null;

  await record.increment('attemptCount');
  const updated = await db.PasswordResetToken.findByPk(record.id);

  if (updated.attemptCount > updated.maxAttempts) return null;
  if (new Date() > updated.expiresAt) return null;
  if (updated.usedAt) return null;

  await updated.update({ usedAt: new Date() });
  return updated.User?.email || updated.userId;
}

module.exports = {
  createResetToken,
  consumeResetToken,
  hashToken,
  TOKEN_EXPIRY_MINUTES,
  MAX_ATTEMPTS,
};
