const jwt = require('jsonwebtoken');
const db = require('../models');
const config = require('../config');
const cryptoUtil = require('../utils/crypto');
const logger = require('../utils/logger');

/**
 * Token Service
 * JWT 토큰 생성 및 Refresh Token Rotation 관리
 */
class TokenService {
  /**
   * Access Token 생성
   * @param {Object} payload - JWT 페이로드
   * @returns {string} Access Token
   */
  generateAccessToken(payload) {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: '15m', // 15분
    });
  }

  /**
   * Refresh Token 생성 및 저장
   * @param {string} userId - 사용자 이메일
   * @param {string} userAgent - User-Agent
   * @param {string} ipAddress - IP 주소
   * @returns {Promise<Object>} { token, refreshToken }
   */
  async generateRefreshToken(userId, userAgent = null, ipAddress = null) {
    // Refresh Token 생성 (30일)
    const refreshTokenPayload = {
      userId,
      type: 'refresh',
      jti: require('crypto').randomBytes(16).toString('hex'), // JWT ID (재사용 감지용)
    };

    const refreshToken = jwt.sign(refreshTokenPayload, config.jwt.secret, {
      expiresIn: '30d', // 30일
    });

    // 토큰 해시 생성 (재사용 감지용)
    const tokenHash = cryptoUtil.hashToken(refreshToken);

    // 만료 시간 계산
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // 암호화된 토큰 저장
    const encryptedToken = cryptoUtil.encrypt(refreshToken);

    // DB에 저장
    const refreshTokenRecord = await db.RefreshToken.create({
      userId,
      token: encryptedToken,
      tokenHash,
      expiresAt,
      userAgent,
      ipAddress,
    });

    return {
      token: refreshToken,
      refreshTokenRecord,
    };
  }

  /**
   * Refresh Token 검증 및 Rotation
   * @param {string} refreshToken - Refresh Token
   * @param {string} userAgent - User-Agent
   * @param {string} ipAddress - IP 주소
   * @returns {Promise<Object>} { accessToken, refreshToken, user }
   */
  async refreshAccessToken(refreshToken, userAgent = null, ipAddress = null) {
    // 1. JWT 검증
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.jwt.secret);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Refresh token has expired');
      }
      throw new Error('Invalid refresh token');
    }

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    const userId = decoded.userId;
    const jti = decoded.jti;

    // 2. 토큰 해시로 DB에서 조회
    const tokenHash = cryptoUtil.hashToken(refreshToken);
    const tokenRecord = await db.RefreshToken.findOne({
      where: {
        tokenHash,
        userId,
      },
    });

    if (!tokenRecord) {
      // 토큰이 DB에 없음 = 이미 사용됨 또는 위조
      // 재사용 공격 가능성: 해당 사용자의 모든 토큰 폐기
      await this.revokeAllUserTokens(userId);
      throw new Error('Refresh token not found or already used');
    }

    // 3. 토큰 상태 확인
    if (tokenRecord.revokedAt) {
      // 이미 폐기된 토큰 사용 시도 = 재사용 공격
      await this.revokeAllUserTokens(userId);
      throw new Error('Refresh token has been revoked');
    }

    if (new Date() > tokenRecord.expiresAt) {
      // 만료된 토큰
      await tokenRecord.update({ revokedAt: new Date() });
      throw new Error('Refresh token has expired');
    }

    // 4. 사용자 확인
    const user = await db.User.findByPk(userId);
    if (!user || user.status === 'DELETED') {
      throw new Error('User not found or deleted');
    }

    // 5. Refresh Token Rotation
    // 기존 토큰 폐기
    await tokenRecord.update({
      revokedAt: new Date(),
    });

    // 새 Refresh Token 생성
    const { token: newRefreshToken, refreshTokenRecord: newTokenRecord } =
      await this.generateRefreshToken(userId, userAgent, ipAddress);

    // 기존 토큰에 새 토큰 ID 연결 (Rotation 추적)
    await tokenRecord.update({
      replacedBy: newTokenRecord.id,
    });

    // 6. 새 Access Token 생성
    const accessToken = this.generateAccessToken({
      email: user.email,
      name: user.name,
      role: user.role,
    });

    logger.info('Token refreshed', {
      userId,
      oldTokenId: tokenRecord.id,
      newTokenId: newTokenRecord.id,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        profileImage: user.profileImage,
      },
    };
  }

  /**
   * 사용자의 모든 Refresh Token 폐기
   * @param {string} userId - 사용자 이메일
   */
  async revokeAllUserTokens(userId) {
    await db.RefreshToken.update(
      {
        revokedAt: new Date(),
      },
      {
        where: {
          userId,
          revokedAt: null,
        },
      }
    );

    logger.warn('All refresh tokens revoked for user', { userId });
  }

  /**
   * 특정 Refresh Token 폐기
   * @param {string} refreshToken - Refresh Token
   */
  async revokeRefreshToken(refreshToken) {
    const tokenHash = cryptoUtil.hashToken(refreshToken);
    const tokenRecord = await db.RefreshToken.findOne({
      where: {
        tokenHash,
      },
    });

    if (tokenRecord && !tokenRecord.revokedAt) {
      await tokenRecord.update({
        revokedAt: new Date(),
      });
    }
  }

  /**
   * 만료된 토큰 정리 (Cron Job용)
   */
  async cleanupExpiredTokens() {
    const result = await db.RefreshToken.update(
      {
        revokedAt: new Date(),
      },
      {
        where: {
          expiresAt: {
            [db.Sequelize.Op.lt]: new Date(),
          },
          revokedAt: null,
        },
      }
    );

    logger.info('Expired tokens cleaned up', { count: result[0] });
  }
}

module.exports = new TokenService();
