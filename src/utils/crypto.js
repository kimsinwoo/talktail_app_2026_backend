const crypto = require('crypto');

/**
 * 암호화 유틸리티
 * Refresh Token 암호화/복호화
 */
class Crypto {
  constructor() {
    // 환경 변수에서 암호화 키 가져오기
    this.algorithm = 'aes-256-gcm';
    this.key = this.getEncryptionKey();
  }

  /**
   * 암호화 키 생성 또는 가져오기
   * @returns {Buffer} 암호화 키
   */
  getEncryptionKey() {
    const keyString = process.env.ENCRYPTION_KEY;
    
    if (!keyString) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }

    // 32바이트 키 생성 (SHA256 해시 사용)
    return crypto.createHash('sha256').update(keyString).digest();
  }

  /**
   * Refresh Token 암호화
   * @param {string} token - 암호화할 토큰
   * @returns {string} 암호화된 토큰 (base64)
   */
  encrypt(token) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(token, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    // IV + AuthTag + Encrypted Data를 결합
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  /**
   * Refresh Token 복호화
   * @param {string} encryptedToken - 암호화된 토큰
   * @returns {string} 복호화된 토큰
   */
  decrypt(encryptedToken) {
    const parts = encryptedToken.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted token format');
    }

    const [ivBase64, authTagBase64, encrypted] = parts;
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * 토큰 해시 생성 (재사용 감지용)
   * @param {string} token - 토큰
   * @returns {string} SHA256 해시
   */
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

// 싱글톤 인스턴스
const cryptoUtil = new Crypto();

module.exports = cryptoUtil;
