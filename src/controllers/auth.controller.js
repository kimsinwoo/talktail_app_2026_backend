const PKCE = require('../utils/pkce');
const stateStore = require('../utils/stateStore');
const oauthFactory = require('../services/oauth/oauth.factory');
const tokenService = require('../services/token.service');
const userService = require('../services/user.service');
const logger = require('../utils/logger');
const { AppError } = require('../middlewares/errorHandler');

/**
 * OAuth 시작
 * POST /auth/:provider/start
 */
const startOAuth = async (req, res, next) => {
  try {
    const { provider } = req.params;
    const { redirect_uri } = req.body;

    // Provider 유효성 검증
    if (!oauthFactory.isSupported(provider)) {
      throw new AppError(`Unsupported OAuth provider: ${provider}`, 400);
    }

    // PKCE 생성
    const codeVerifier = PKCE.generateCodeVerifier();
    const codeChallenge = PKCE.generateCodeChallenge(codeVerifier);

    // State 생성 및 저장
    const state = stateStore.create(provider, codeChallenge);

    // OAuth 서비스 가져오기
    const oauthService = oauthFactory.getService(provider);

    // 인증 URL 생성
    const authorizationUrl = oauthService.getAuthorizationUrl(
      codeChallenge,
      state,
      redirect_uri
    );

    // code_verifier는 클라이언트에 반환 (서버에는 저장하지 않음)
    // 클라이언트는 이를 안전하게 저장하고 callback에서 전달해야 함
    res.json({
      success: true,
      data: {
        authorizationUrl,
        state,
        codeVerifier, // 클라이언트에 반환 (Secure Storage에 저장)
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * OAuth 콜백 처리
 * POST /auth/:provider/callback
 */
const handleOAuthCallback = async (req, res, next) => {
  try {
    const { provider } = req.params;
    const { code, state, code_verifier, redirect_uri } = req.body;

    // 필수 파라미터 검증
    if (!code || !state || !code_verifier) {
      throw new AppError('Missing required parameters: code, state, code_verifier', 400);
    }

    // Provider 유효성 검증
    if (!oauthFactory.isSupported(provider)) {
      throw new AppError(`Unsupported OAuth provider: ${provider}`, 400);
    }

    // State 검증
    const stateData = stateStore.get(state);
    if (!stateData) {
      throw new AppError('Invalid or expired state', 400);
    }

    if (stateData.provider !== provider) {
      throw new AppError('State provider mismatch', 400);
    }

    // State 일회용 (삭제)
    stateStore.delete(state);

    // PKCE 검증
    if (!PKCE.verify(code_verifier, stateData.codeChallenge)) {
      throw new AppError('Invalid code_verifier', 400);
    }

    // OAuth 서비스 가져오기
    const oauthService = oauthFactory.getService(provider);

    // Authorization Code를 Access Token으로 교환
    const tokenData = await oauthService.exchangeCodeForToken(
      code,
      code_verifier,
      redirect_uri
    );

    // 사용자 찾기 또는 생성
    const { user, isNewUser } = await userService.findOrCreateUserByOAuth({
      provider,
      providerId: tokenData.providerId,
      email: tokenData.email,
      name: tokenData.name,
      profileImage: tokenData.profileImage,
    });

    // Access Token 생성
    const accessToken = tokenService.generateAccessToken({
      email: user.email,
      name: user.name,
      role: user.role,
    });

    // Refresh Token 생성 및 저장
    const { token: refreshToken } = await tokenService.generateRefreshToken(
      user.email,
      req.get('user-agent'),
      req.ip
    );

    logger.info('OAuth login successful', {
      provider,
      userId: user.email,
      isNewUser,
    });

    res.json({
      success: true,
      message: isNewUser ? '회원가입 및 로그인 성공' : '로그인 성공',
      data: {
        accessToken,
        refreshToken,
        user: {
          email: user.email,
          name: user.name,
          role: user.role,
          profileImage: user.profileImage,
        },
        isNewUser,
      },
    });
  } catch (error) {
    logger.error('OAuth callback error:', error);
    next(error);
  }
};

/**
 * 토큰 재발급
 * POST /auth/token/refresh
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token is required', 400);
    }

    // Refresh Token 검증 및 Rotation
    const result = await tokenService.refreshAccessToken(
      refreshToken,
      req.get('user-agent'),
      req.ip
    );

    res.json({
      success: true,
      message: 'Token refreshed',
      data: result,
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    next(error);
  }
};

/**
 * 로그아웃
 * POST /auth/logout
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Refresh Token 폐기
      await tokenService.revokeRefreshToken(refreshToken);
    }

    res.json({
      success: true,
      message: '로그아웃 완료',
    });
  } catch (error) {
    logger.error('Logout error:', error);
    next(error);
  }
};

/**
 * 회원 탈퇴
 * DELETE /users/me
 */
const deleteUser = async (req, res, next) => {
  try {
    const userId = req.user.email;

    // 사용자 확인
    const user = await db.User.findByPk(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (user.status === 'DELETED') {
      throw new AppError('User already deleted', 400);
    }

    // 사용자 삭제 (Soft Delete)
    await userService.deleteUser(userId);

    logger.info('User deleted', { userId });

    res.json({
      success: true,
      message: '회원 탈퇴가 완료되었습니다.',
    });
  } catch (error) {
    logger.error('User deletion error:', error);
    next(error);
  }
};

module.exports = {
  startOAuth,
  handleOAuthCallback,
  refreshToken,
  logout,
  deleteUser,
};
