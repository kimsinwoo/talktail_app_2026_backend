const axios = require('axios');
const oauthConfig = require('../../config/oauth.config');
const logger = require('../../utils/logger');

/**
 * Kakao OAuth 서비스
 * Authorization Code Flow + PKCE 지원
 */
class KakaoOAuthService {
  constructor() {
    this.config = oauthConfig.kakao;
    this.validateConfig();
  }

  validateConfig() {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('Kakao OAuth configuration is missing');
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
      client_id: this.config.clientId,
      redirect_uri: redirectUri || this.config.mobileRedirectUri,
      response_type: 'code',
      scope: this.config.scope,
      state: state,
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
        idToken: null, // Kakao는 id_token 제공 안 함
        expiresIn: expires_in,
        providerId: userInfo.providerId,
        email: userInfo.email,
        name: userInfo.name,
        profileImage: userInfo.profileImage,
      };
    } catch (error) {
      logger.error('Kakao token exchange error:', error.response?.data || error.message);
      throw new Error(`Kakao token exchange failed: ${error.response?.data?.error_description || error.message}`);
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

      const { id, kakao_account, properties } = response.data;

      // email은 optional (사용자가 동의하지 않을 수 있음)
      const email = kakao_account?.email || null;
      const name = properties?.nickname || kakao_account?.profile?.nickname || null;
      const profileImage = properties?.profile_image || kakao_account?.profile?.profile_image_url || null;

      return {
        providerId: String(id), // Kakao ID는 숫자이므로 문자열로 변환
        email: email,
        name: name,
        profileImage: profileImage,
      };
    } catch (error) {
      logger.error('Kakao user info error:', error.response?.data || error.message);
      throw new Error(`Failed to get Kakao user info: ${error.message}`);
    }
  }
}

module.exports = KakaoOAuthService;
