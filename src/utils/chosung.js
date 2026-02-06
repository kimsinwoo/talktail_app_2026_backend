/**
 * 한글 초성(자음) 추출 유틸 - 자음 검색용
 * 유니코드 한글: 가(0xAC00) ~ 힣(0xD7A3) = 초성(19) * 중성(21) * 종성(28)
 */
const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const CHO_REGEX = /[ㄱ-ㅎ]/;
const HANGUL_SYLABLE_FIRST = 0xac00;
const HANGUL_SYLABLE_LAST = 0xd7a3;

/**
 * 문장에서 한글 음절의 초성만 추출한 문자열 반환 (공백/영문/숫자는 그대로 유지)
 * @param {string} str
 * @returns {string}
 */
function toChosung(str) {
  if (typeof str !== 'string') return '';
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= HANGUL_SYLABLE_FIRST && code <= HANGUL_SYLABLE_LAST) {
      const offset = code - HANGUL_SYLABLE_FIRST;
      result += CHO[Math.floor(offset / (21 * 28))];
    } else {
      result += str[i];
    }
  }
  return result;
}

/**
 * 문자열이 초성(자음)만으로 이루어졌는지 여부 (공백 제외)
 * @param {string} str
 * @returns {boolean}
 */
function isChosungOnly(str) {
  if (typeof str !== 'string') return false;
  const trimmed = str.replace(/\s/g, '');
  if (trimmed.length === 0) return false;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c < 'ㄱ' || c > 'ㅎ') return false;
  }
  return true;
}

/**
 * 검색 키워드로 텍스트 매칭 여부 (일반 포함 검색 + 자음 검색)
 * @param {string} text - 검색 대상 (제목+내용 등)
 * @param {string} keyword - 사용자 입력
 * @returns {boolean}
 */
function matchByChosungOrText(text, keyword) {
  if (typeof text !== 'string' || typeof keyword !== 'string') return false;
  const k = keyword.trim();
  if (k.length === 0) return true;

  const textNorm = text.toLowerCase();
  const keyNorm = k.toLowerCase();

  if (keyNorm.length === 0) return true;

  if (isChosungOnly(keyNorm)) {
    const textChosung = toChosung(text);
    return textChosung.includes(keyNorm);
  }

  if (textNorm.includes(keyNorm)) return true;
  const textChosung = toChosung(text);
  const keyChosung = toChosung(k);
  return textChosung.includes(keyChosung);
}

module.exports = {
  toChosung,
  isChosungOnly,
  matchByChosungOrText,
  CHO,
};
