const GoogleOAuthService = require('./google.service');
const KakaoOAuthService = require('./kakao.service');
const NaverOAuthService = require('./naver.service');
const logger = require('../../utils/logger');

/**
 * OAuth Factory
 * Provider별 서비스 인스턴스 생성 및 공통 인터페이스 제공
 */
class OAuthFactory {
  constructor() {
    this.services = {
      google: new GoogleOAuthService(),
      kakao: new KakaoOAuthService(),
      naver: new NaverOAuthService(),
    };
  }

  /**
   * Provider별 서비스 가져오기
   * @param {string} provider - 'google' | 'kakao' | 'naver'
   * @returns {Object} OAuth 서비스 인스턴스
   */
  getService(provider) {
    const service = this.services[provider.toLowerCase()];
    
    if (!service) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    return service;
  }

  /**
   * 지원하는 Provider 목록
   * @returns {string[]} Provider 목록
   */
  getSupportedProviders() {
    return Object.keys(this.services);
  }

  /**
   * Provider 유효성 검증
   * @param {string} provider - Provider 이름
   * @returns {boolean} 지원 여부
   */
  isSupported(provider) {
    return provider && this.services[provider.toLowerCase()] !== undefined;
  }
}

// 싱글톤 인스턴스
const oauthFactory = new OAuthFactory();

module.exports = oauthFactory;
