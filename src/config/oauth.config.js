require('dotenv').config();

/**
 * OAuth 설정
 * 각 Provider의 클라이언트 정보를 관리
 */
module.exports = {
  // Google OAuth 설정
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'https://your-domain.com/auth/google/callback',
    // 모바일 앱용: deep link 또는 universal link
    mobileRedirectUri: process.env.GOOGLE_MOBILE_REDIRECT_URI || 'talktail://oauth/google/callback',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userInfoEndpoint: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scope: 'openid email profile',
  },

  // Kakao OAuth 설정
  kakao: {
    clientId: process.env.KAKAO_CLIENT_ID,
    clientSecret: process.env.KAKAO_CLIENT_SECRET,
    redirectUri: process.env.KAKAO_REDIRECT_URI || 'https://your-domain.com/auth/kakao/callback',
    mobileRedirectUri: process.env.KAKAO_MOBILE_REDIRECT_URI || 'talktail://oauth/kakao/callback',
    authorizationEndpoint: 'https://kauth.kakao.com/oauth/authorize',
    tokenEndpoint: 'https://kauth.kakao.com/oauth/token',
    userInfoEndpoint: 'https://kapi.kakao.com/v2/user/me',
    scope: 'profile_nickname profile_image account_email',
  },

  // Naver OAuth 설정
  naver: {
    clientId: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
    redirectUri: process.env.NAVER_REDIRECT_URI || 'https://your-domain.com/auth/naver/callback',
    mobileRedirectUri: process.env.NAVER_MOBILE_REDIRECT_URI || 'talktail://oauth/naver/callback',
    authorizationEndpoint: 'https://nid.naver.com/oauth2.0/authorize',
    tokenEndpoint: 'https://nid.naver.com/oauth2.0/token',
    userInfoEndpoint: 'https://openapi.naver.com/v1/nid/me',
    scope: 'name email profile_image',
  },

  // 공통 설정
  common: {
    // PKCE 설정
    codeChallengeMethod: 'S256', // SHA256
    // State 유효 시간 (초)
    stateExpiration: 600, // 10분
    // Access Token 유효 시간
    accessTokenExpiration: 15 * 60, // 15분 (초)
    // Refresh Token 유효 시간
    refreshTokenExpiration: 30 * 24 * 60 * 60, // 30일 (초)
  },
};
