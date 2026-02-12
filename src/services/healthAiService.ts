/**
 * 건강 질문 도우미 AI (Google AI = Generative Language API, API Key만 사용).
 * AI Studio에서 발급한 API 키로 generativelanguage.googleapis.com 호출.
 */
import axios, { AxiosError } from 'axios';
import type {
  VertexGenerateContentRequest,
  VertexGenerateContentResponse,
  HealthAiError,
} from './healthAiService.types';

/** Google AI (Generative Language API) - AI Studio API 키 사용 */
const GOOGLE_AI_BASE = 'https://generativelanguage.googleapis.com';
/** 문서 기준 사용 가능 모델 (gemini-1.5-flash는 v1beta에서 404) */
const MODEL = 'gemini-2.5-flash-lite';
const TEMPERATURE = 0.4;
const MAX_OUTPUT_TOKENS = 1024;

const SYSTEM_PROMPT = `당신은 건강 질문 도우미 AI입니다. 사용자가 자신의 증상이나 애완동물(강아지/고양이 포함)의 상황을 말하면, 참고할 수 있는 정보만 제공합니다.

필수 규칙:
1. 진단·확정 표현을 절대 쓰지 마세요. 금지 예: "진단", "확진", "~질병입니다", "~증상으로 보입니다", "~병입니다", "~로 판단됩니다", "이것은 OO입니다(병명)". 대신 "참고로 생각해볼 수 있는 내용", "병원에서 확인해 보시면 좋습니다"처럼 안내만 하세요.
2. 답변 형식: 소제목은 **굵게**만 사용하세요. 목록은 반드시 한 줄에 한 항목씩 "• 항목 내용" 형태로만 작성하세요(별표 * 마크다운 사용 금지). 중첩 목록은 "  • 하위 항목"처럼 들여쓰기로만 구분하세요.
3. 답변은 끊기지 않도록 핵심만 간결하게, 단 문장 끝까지 완성해서 주세요. "~할 수 있습니다." 등으로 문장을 끝내세요.
4. 반드시 "정확한 판단은 의료·수의 전문가에게 확인하세요" 문구를 포함하세요.
5. 전문용어는 쉬운 말로 풀어서 설명합니다.
6. 사람·반려동물 모두 동일하게 적용합니다.
7. 너무 길지 않게 답변을 하도록합니다.
8. 반려동물 건강 관련 질문 이외에는 답변을 하지 않도록 합니다.`;

function getConfig(): { apiKey: string } {
  const apiKey = process.env.GCP_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw createHealthAiError('MISSING_API_KEY', 'GCP_API_KEY is not set', 503);
  }
  return { apiKey: apiKey.trim() };
}

function createHealthAiError(code: string, message: string, statusCode?: number): HealthAiError {
  const err: HealthAiError = { code, message };
  if (statusCode != null) err.statusCode = statusCode;
  return err;
}

/** Generative Language API (AI Studio) 엔드포인트 */
function buildEndpoint(apiKey: string): string {
  return `${GOOGLE_AI_BASE}/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function parseVertexError(err: unknown): HealthAiError {
  if (err && typeof err === 'object' && 'isAxiosError' in err) {
    const axiosErr = err as AxiosError<{ error?: { message?: string; code?: number } }>;
    const status = axiosErr.response?.status;
    const body = axiosErr.response?.data;
    const msg = body?.error?.message ?? axiosErr.message ?? 'Google AI request failed';
    console.error('[healthAiService] Google AI request failed', {
      status,
      message: msg,
      data: body,
    });
    return createHealthAiError('GOOGLE_AI_ERROR', msg, status);
  }
  if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    return err as HealthAiError;
  }
  const message = err instanceof Error ? err.message : String(err);
  return createHealthAiError('UNKNOWN', message);
}

/**
 * Ask the health assistant AI (Google AI / Generative Language API, gemini-2.5-flash-lite).
 * Returns empty string on empty/undefined response; throws structured HealthAiError on failure.
 */
export async function askHealthAI(userInput: string): Promise<string> {
  const trimmed = typeof userInput === 'string' ? userInput.trim() : '';
  if (!trimmed) {
    throw createHealthAiError('INVALID_INPUT', 'userInput must be a non-empty string', 400);
  }

  const { apiKey } = getConfig();
  const url = buildEndpoint(apiKey);

  const body: VertexGenerateContentRequest = {
    contents: [{ role: 'user', parts: [{ text: trimmed }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      temperature: TEMPERATURE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  };

  try {
    const response = await axios.post<VertexGenerateContentResponse>(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
      validateStatus: () => true,
    });

    if (response.status !== 200) {
      const errBody = response.data as { error?: { message?: string; code?: number } };
      const msg = errBody?.error?.message ?? `Google AI returned ${response.status}`;
      console.error('[healthAiService] Google AI non-200', {
        status: response.status,
        code: errBody?.error?.code,
        message: msg,
        body: errBody,
      });
      throw createHealthAiError('GOOGLE_AI_ERROR', msg, response.status);
    }

    const data = response.data;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text == null || typeof text !== 'string') {
      return '';
    }
    return text.trim();
  } catch (err) {
    const healthErr = parseVertexError(err);
    throw healthErr;
  }
}
