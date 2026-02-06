const axios = require('axios');
const jwt = require('jsonwebtoken');
const oauthConfig = require('../../config/oauth.config');
const logger = require('../../utils/logger');

/**
 * Google OAuth 서비스
 * Authorization Code Flow + PKCE 지원
 */
class GoogleOAuthService {
  constructor() {
    this.config = oauthConfig.google;
    this.validateConfig();
  }

  validateConfig() {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('Google OAuth configuration is missing');
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
      access_type: 'offline', // Refresh Token 받기 위해 필수
      prompt: 'consent', // 항상 동의 화면 표시 (Refresh Token 보장)
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
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri || this.config.mobileRedirectUri,
          code_verifier: codeVerifier,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const { access_token, refresh_token, id_token, expires_in } = response.data;

      // id_token 검증
      const decodedIdToken = this.verifyIdToken(id_token);

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        idToken: id_token,
        expiresIn: expires_in,
        providerId: decodedIdToken.sub, // Google의 고유 ID
        email: decodedIdToken.email,
        name: decodedIdToken.name,
        profileImage: decodedIdToken.picture,
      };
    } catch (error) {
      logger.error('Google token exchange error:', error.response?.data || error.message);
      throw new Error(`Google token exchange failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * id_token JWT 검증
   * @param {string} idToken - Google id_token
   * @returns {Object} 디코딩된 토큰 페이로드
   */
  /**
   * id_token JWT 검증
   * @param {string} idToken - Google id_token
   * @returns {Object} 디코딩된 토큰 페이로드
   * 
   * 주의: 프로덕션에서는 Google의 공개키로 서명 검증을 해야 합니다.
   * 현재는 기본적인 검증만 수행합니다.
   */
  verifyIdToken(idToken) {
    try {
      // JWT 디코딩 (서명 검증 없이)
      // 프로덕션에서는 Google의 JWKS를 사용하여 서명 검증 필요
      const decoded = jwt.decode(idToken, { complete: true });
      
      if (!decoded || !decoded.payload) {
        throw new Error('Invalid id_token format');
      }

      const payload = decoded.payload;

      // aud (audience) 검증 - clientId와 일치해야 함
      if (payload.aud !== this.config.clientId) {
        throw new Error('Invalid id_token audience');
      }

      // iss (issuer) 검증 - Google이 발급한 토큰인지 확인
      if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
        throw new Error('Invalid id_token issuer');
      }

      // exp (expiration) 검증
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        throw new Error('id_token has expired');
      }

      // iat (issued at) 검증 - 미래에 발급된 토큰은 거부
      if (payload.iat && payload.iat > now + 60) {
        throw new Error('id_token issued in the future');
      }

      return payload;
    } catch (error) {
      logger.error('Google id_token verification error:', error.message);
      throw new Error(`Invalid id_token: ${error.message}`);
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

      return {
        providerId: response.data.id,
        email: response.data.email,
        name: response.data.name,
        profileImage: response.data.picture,
      };
    } catch (error) {
      logger.error('Google user info error:', error.response?.data || error.message);
      throw new Error(`Failed to get Google user info: ${error.message}`);
    }
  }
}

module.exports = GoogleOAuthService;
