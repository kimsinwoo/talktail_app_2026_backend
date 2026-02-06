const crypto = require('crypto');

/**
 * PKCE (Proof Key for Code Exchange) 유틸리티
 * 모바일 앱의 OAuth 보안 강화
 */
class PKCE {
  /**
   * code_verifier 생성
   * @returns {string} 43-128자의 URL-safe base64 문자열
   */
  static generateCodeVerifier() {
    // 32바이트 랜덤 데이터 생성 (256비트)
    const randomBytes = crypto.randomBytes(32);
    // URL-safe base64 인코딩
    return randomBytes.toString('base64url');
  }

  /**
   * code_challenge 생성 (S256 방식)
   * @param {string} codeVerifier - code_verifier
   * @returns {string} code_challenge
   */
  static generateCodeChallenge(codeVerifier) {
    // SHA256 해시 생성
    const hash = crypto.createHash('sha256');
    hash.update(codeVerifier);
    // URL-safe base64 인코딩
    return hash.digest('base64url');
  }

  /**
   * code_verifier와 code_challenge 검증
   * @param {string} codeVerifier - 클라이언트가 제공한 code_verifier
   * @param {string} codeChallenge - 클라이언트가 제공한 code_challenge
   * @returns {boolean} 검증 결과
   */
  static verify(codeVerifier, codeChallenge) {
    const expectedChallenge = this.generateCodeChallenge(codeVerifier);
    return expectedChallenge === codeChallenge;
  }
}

module.exports = PKCE;
