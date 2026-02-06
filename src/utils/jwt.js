const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * JWT 유틸리티
 * 토큰 생성 및 검증
 */
class JWTUtil {
  /**
   * Access Token 생성
   * @param {Object} payload - JWT 페이로드
   * @returns {string} Access Token
   */
  static generateAccessToken(payload) {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: '15m', // 15분
    });
  }

  /**
   * Refresh Token 생성
   * @param {Object} payload - JWT 페이로드
   * @returns {string} Refresh Token
   */
  static generateRefreshToken(payload) {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: '30d', // 30일
    });
  }

  /**
   * Token 검증
   * @param {string} token - JWT 토큰
   * @returns {Object} 디코딩된 페이로드
   */
  static verify(token) {
    try {
      return jwt.verify(token, config.jwt.secret);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token has expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Token 디코딩 (검증 없이)
   * @param {string} token - JWT 토큰
   * @returns {Object} 디코딩된 페이로드
   */
  static decode(token) {
    return jwt.decode(token);
  }
}

module.exports = JWTUtil;
