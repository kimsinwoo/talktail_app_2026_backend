const db = require('../models');
const logger = require('../utils/logger');

/**
 * User Service
 * 사용자 생성 및 OAuth 계정 관리
 */
class UserService {
  /**
   * OAuth 계정으로 사용자 찾기 또는 생성
   * @param {Object} oauthData - OAuth 사용자 정보
   * @param {string} oauthData.provider - Provider 이름
   * @param {string} oauthData.providerId - Provider 고유 ID
   * @param {string} oauthData.email - 이메일 (optional)
   * @param {string} oauthData.name - 이름
   * @param {string} oauthData.profileImage - 프로필 이미지 URL
   * @returns {Promise<Object>} { user, isNewUser }
   */
  async findOrCreateUserByOAuth(oauthData) {
    const { provider, providerId, email, name, profileImage } = oauthData;

    // 1. OAuthAccount로 기존 사용자 찾기
    let oauthAccount = await db.OAuthAccount.findOne({
      where: {
        provider,
        providerId,
      },
      include: [
        {
          model: db.User,
          as: 'User',
        },
      ],
    });

    let user;
    let isNewUser = false;

    if (oauthAccount) {
      // 기존 OAuth 계정이 있는 경우
      user = oauthAccount.User;

      // 사용자 상태 확인
      if (user.status === 'DELETED') {
        throw new Error('This account has been deleted');
      }

      // OAuthAccount 정보 업데이트
      await oauthAccount.update({
        email: email || oauthAccount.email,
        name: name || oauthAccount.name,
        profileImage: profileImage || oauthAccount.profileImage,
      });

      // User 정보 업데이트
      await user.update({
        name: name || user.name,
        profileImage: profileImage || user.profileImage,
        lastLoginAt: new Date(),
      });
    } else {
      // 새 사용자 생성
      // email이 있는 경우 기존 User와 연결 시도
      if (email) {
        user = await db.User.findByPk(email);
      }

      if (user) {
        // 기존 User가 있는 경우 OAuthAccount만 생성
        // providerId 중복 확인
        const existingOAuth = await db.OAuthAccount.findOne({
          where: {
            provider,
            providerId,
          },
        });

        if (existingOAuth) {
          throw new Error('OAuth account already exists');
        }

        oauthAccount = await db.OAuthAccount.create({
          userId: user.email,
          provider,
          providerId,
          email,
          name,
          profileImage,
        });

        // User 정보 업데이트
        await user.update({
          name: name || user.name,
          profileImage: profileImage || user.profileImage,
          lastLoginAt: new Date(),
        });
      } else {
        // 완전히 새로운 사용자 생성
        // email이 없는 경우 임시 이메일 생성 (providerId 기반)
        const tempEmail = email || `${provider}_${providerId}@oauth.talktail.com`;

        // 이메일 중복 확인
        user = await db.User.findByPk(tempEmail);
        if (user) {
          // 이미 존재하는 경우 OAuthAccount만 생성
          oauthAccount = await db.OAuthAccount.create({
            userId: user.email,
            provider,
            providerId,
            email: email || null,
            name,
            profileImage,
          });
        } else {
          // 새 User 생성
          user = await db.User.create({
            email: tempEmail,
            name: name || 'User',
            profileImage,
            status: 'ACTIVE',
            isActive: true,
            role: 'user',
          });

          // OAuthAccount 생성
          oauthAccount = await db.OAuthAccount.create({
            userId: user.email,
            provider,
            providerId,
            email: email || null,
            name,
            profileImage,
          });

          isNewUser = true;
        }
      }
    }

    logger.info('User found or created', {
      userId: user.email,
      provider,
      isNewUser,
    });

    return {
      user,
      isNewUser,
    };
  }

  /**
   * 사용자 삭제 (Soft Delete)
   * @param {string} userId - 사용자 이메일
   */
  async deleteUser(userId) {
    const user = await db.User.findByPk(userId);

    if (!user) {
      throw new Error('User not found');
    }

    if (user.status === 'DELETED') {
      throw new Error('User already deleted');
    }

    // Soft Delete
    await user.update({
      status: 'DELETED',
      deletedAt: new Date(),
      isActive: false,
    });

    // OAuthAccount 삭제
    await db.OAuthAccount.destroy({
      where: {
        userId,
      },
    });

    // 모든 RefreshToken 폐기
    await db.RefreshToken.update(
      {
        revokedAt: new Date(),
      },
      {
        where: {
          userId,
          revokedAt: null,
        },
      }
    );

    logger.info('User deleted', { userId });
  }
}

module.exports = new UserService();
