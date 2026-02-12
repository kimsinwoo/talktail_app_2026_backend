/**
 * Refresh token rotation: create (hash in DB), find valid, revoke, detect reuse.
 * Uses RefreshTokens table: tokenHash, userId, expiresAt, revokedAt, replacedBy.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../models');
const config = require('../config');

const REFRESH_EXPIRES = config.jwt.refreshExpiresIn || '7d';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create a new refresh token and store its hash in DB.
 * @param {string} userId - User email
 * @param {string} [userAgent]
 * @param {string} [ipAddress]
 * @returns {Promise<string>} Plain refresh token to return to client
 */
async function createRefreshToken(userId, userAgent, ipAddress) {
  const token = jwt.sign(
    { email: userId, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: REFRESH_EXPIRES }
  );
  const tokenHash = hashToken(token);
  const decoded = jwt.decode(token);
  const expiresAt = new Date(decoded.exp * 1000);

  await db.RefreshToken.create({
    userId,
    token: tokenHash,
    tokenHash,
    expiresAt,
    userAgent: (userAgent || '').slice(0, 500),
    ipAddress: (ipAddress || '').slice(0, 50),
  });

  return token;
}

/**
 * Find a valid (non-revoked, not expired) token record by hash.
 * @param {string} tokenHash
 * @returns {Promise<Model|null>}
 */
async function findValidToken(tokenHash) {
  const tokenRecord = await db.RefreshToken.findOne({
    where: {
      tokenHash,
      revokedAt: null,
    },
  });
  if (!tokenRecord) return null;
  if (new Date() > tokenRecord.expiresAt) return null;
  return tokenRecord;
}

/**
 * Revoke a token by id, optionally set replacedBy.
 */
async function revokeTokenById(id, replacedBy = null) {
  await db.RefreshToken.update(
    { revokedAt: new Date(), replacedBy },
    { where: { id } }
  );
}

/**
 * Revoke all refresh tokens for a user (e.g. on reuse detection).
 */
async function revokeAllForUser(userId) {
  await db.RefreshToken.update(
    { revokedAt: new Date() },
    { where: { userId } }
  );
}

/**
 * Check if this token was already used (reuse). If so, revoke all tokens for that user.
 * @param {string} tokenHash
 * @returns {Promise<boolean>} true if reuse detected
 */
async function isTokenReused(tokenHash) {
  const record = await db.RefreshToken.findOne({ where: { tokenHash } });
  return !!(record && record.revokedAt !== null);
}

module.exports = {
  hashToken,
  createRefreshToken,
  findValidToken,
  revokeTokenById,
  revokeAllForUser,
  isTokenReused,
};
