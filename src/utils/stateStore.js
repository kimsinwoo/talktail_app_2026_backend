const crypto = require('crypto');

/**
 * State Store
 * CSRF 공격 방지를 위한 state 관리
 * 프로덕션에서는 Redis 사용 권장
 */
class StateStore {
  constructor() {
    // 메모리 기반 저장소 (개발용)
    // 프로덕션에서는 Redis로 교체 필요
    this.store = new Map();
    // 만료된 항목 정리 주기 (10분)
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 10 * 60 * 1000);
  }

  /**
   * State 생성 및 저장
   * @param {string} provider - OAuth provider
   * @param {string} codeChallenge - PKCE code_challenge
   * @returns {string} state 값
   */
  create(provider, codeChallenge) {
    // 32바이트 랜덤 데이터로 state 생성
    const state = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10분 후 만료

    this.store.set(state, {
      provider,
      codeChallenge,
      expiresAt,
      createdAt: Date.now(),
    });

    return state;
  }

  /**
   * State 검증 및 조회
   * @param {string} state - 검증할 state 값
   * @returns {Object|null} state 정보 또는 null
   */
  get(state) {
    const data = this.store.get(state);
    
    if (!data) {
      return null;
    }

    // 만료 확인
    if (Date.now() > data.expiresAt) {
      this.store.delete(state);
      return null;
    }

    return data;
  }

  /**
   * State 삭제 (일회용)
   * @param {string} state - 삭제할 state 값
   */
  delete(state) {
    this.store.delete(state);
  }

  /**
   * 만료된 항목 정리
   */
  cleanup() {
    const now = Date.now();
    for (const [state, data] of this.store.entries()) {
      if (now > data.expiresAt) {
        this.store.delete(state);
      }
    }
  }

  /**
   * 모든 항목 삭제 (테스트용)
   */
  clear() {
    this.store.clear();
  }

  /**
   * 리소스 정리
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

// 싱글톤 인스턴스
const stateStore = new StateStore();

module.exports = stateStore;
