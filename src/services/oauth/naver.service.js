const axios = require('axios');
const oauthConfig = require('../../config/oauth.config');
const logger = require('../../utils/logger');

/**
 * Naver OAuth 서비스
 * Authorization Code Flow + PKCE 지원
 */
class NaverOAuthService {
  constructor() {
    this.config = oauthConfig.naver;
    this.validateConfig();
  }

  validateConfig() {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('Naver OAuth configuration is missing');
    }
  }

  /**
   * OAuth 인증 URL 생성
   * @param {string} codeChallenge - PKCE code_challenge
   * @param {string} state - CSRF 방지용 state
   * @param {string} redirectUri - 리다이렉트 URI (모바일 앱용)
   * @returns {string} OAuth 인증 URL
   */
  getAuthorizationUrl(codeChallenge, state, redirectUri = null) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: redirectUri || this.config.mobileRedirectUri,
      state: state,
      scope: this.config.scope,
      // Naver는 PKCE를 공식 지원하지 않지만, code_challenge를 추가
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${this.config.authorizationEndpoint}?${params.toString()}`;
  }

  /**
   * Authorization Code를 Access Token으로 교환
   * @param {string} code - Authorization Code
   * @param {string} codeVerifier - PKCE code_verifier
   * @param {string} redirectUri - 리다이렉트 URI
   * @returns {Promise<Object>} Token 정보
   */
  async exchangeCodeForToken(code, codeVerifier, redirectUri = null) {
    try {
      const response = await axios.post(
        this.config.tokenEndpoint,
        new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: redirectUri || this.config.mobileRedirectUri,
          code: code,
          // Naver는 PKCE를 공식 지원하지 않지만, code_verifier를 추가
          code_verifier: codeVerifier,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const { access_token, refresh_token, expires_in } = response.data;

      // 사용자 정보 조회
      const userInfo = await this.getUserInfo(access_token);

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        idToken: null, // Naver는 id_token 제공 안 함
        expiresIn: expires_in,
        providerId: userInfo.providerId,
        email: userInfo.email,
        name: userInfo.name,
        profileImage: userInfo.profileImage,
      };
    } catch (error) {
      logger.error('Naver token exchange error:', error.response?.data || error.message);
      throw new Error(`Naver token exchange failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Access Token으로 사용자 정보 조회
   * @param {string} accessToken - Access Token
   * @returns {Promise<Object>} 사용자 정보
   */
  async getUserInfo(accessToken) {
    try {
      const response = await axios.get(this.config.userInfoEndpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const { response: userData } = response.data;

      if (!userData) {
        throw new Error('Invalid Naver user info response');
      }

      // Naver는 response.id를 providerId로 사용
      return {
        providerId: userData.id,
        email: userData.email || null, // email은 optional
        name: userData.name || null,
        profileImage: userData.profile_image || null,
      };
    } catch (error) {
      logger.error('Naver user info error:', error.response?.data || error.message);
      throw new Error(`Failed to get Naver user info: ${error.message}`);
    }
  }
}

module.exports = NaverOAuthService;
