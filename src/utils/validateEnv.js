/**
 * 환경 변수 검증
 * 서버 시작 시 필수 환경 변수 확인
 */
function validateEnvironment() {
  const required = [
    'JWT_SECRET',
    'ENCRYPTION_KEY',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // JWT_SECRET 길이 검증
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  // ENCRYPTION_KEY 길이 검증
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
  }

  // OAuth 설정 검증 (선택사항이지만 경고)
  const oauthProviders = ['google', 'kakao', 'naver'];
  const missingOAuth = oauthProviders.filter(provider => {
    return !process.env[`${provider.toUpperCase()}_CLIENT_ID`] ||
           !process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
  });

  if (missingOAuth.length > 0 && process.env.NODE_ENV === 'production') {
    console.warn(`⚠️  Warning: OAuth providers not configured: ${missingOAuth.join(', ')}`);
  }
}

module.exports = validateEnvironment;
