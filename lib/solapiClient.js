import { SolapiMessageService } from 'solapi';
import { TEMPLATE_IDS } from './notifyTemplates';

export { TEMPLATE_IDS } from './notifyTemplates';
export {
  TEMPLATE_PREVIEWS,
  resolveNotifyTemplateType,
  buildNotifyVariables,
  renderTemplatePreview,
} from './notifyTemplates';

function getConfig() {
  return {
    apiKey: (process.env.SOLAPI_API_KEY || '').trim(),
    apiSecret: (process.env.SOLAPI_API_SECRET || '').trim(),
    pfId: (process.env.KAKAO_CHANNEL_PFID || '').trim(),
    sender: (process.env.SOLAPI_SENDER || '').trim(),
  };
}

/** API 키·채널 ID가 모두 있을 때만 실제 발송 가능 */
export function isAlimtalkEnabled() {
  const { apiKey, apiSecret, pfId } = getConfig();
  return Boolean(apiKey && apiSecret && pfId);
}

function getMessageService() {
  const { apiKey, apiSecret } = getConfig();
  if (!apiKey || !apiSecret) return null;
  return new SolapiMessageService(apiKey, apiSecret);
}

/** 010-1234-5678 → 01012345678 */
function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/**
 * 변수 키를 솔라피 형식(#{변수명})으로 정규화.
 * 호출측에서 '#{이름}' 또는 '이름' 둘 다 넘길 수 있음.
 */
function normalizeVariables(variables = {}) {
  const out = {};
  for (const [key, value] of Object.entries(variables)) {
    const normalizedKey = key.startsWith('#{') ? key : `#{${key}}`;
    out[normalizedKey] = value == null ? '' : String(value);
  }
  return out;
}

function extractMessageId(result) {
  if (!result || typeof result !== 'object') return null;
  if (typeof result.messageId === 'string') return result.messageId;
  const list = result.groupInfo?.messageList || result.messageList;
  if (Array.isArray(list) && list[0]?.messageId) return list[0].messageId;
  if (typeof result.groupId === 'string') return result.groupId;
  return null;
}

/**
 * 카카오 알림톡 1건 발송 (solapi SDK — 서버 전용).
 *
 * @param {object} params
 * @param {string} params.to
 * @param {keyof typeof TEMPLATE_IDS | string} params.templateType
 * @param {Record<string, string|number>} [params.variables]
 * @returns {Promise<{ success: boolean, messageId?: string|null, templateId?: string, error?: string, skipped?: boolean }>}
 */
export async function sendAlimtalk({ to, templateType, variables = {} }) {
  const { apiKey, apiSecret, pfId, sender } = getConfig();

  if (!apiKey || !apiSecret || !pfId) {
    console.warn(
      '[solapi] 발송 비활성화 상태 — SOLAPI_API_KEY / SOLAPI_API_SECRET / KAKAO_CHANNEL_PFID 확인'
    );
    return {
      success: false,
      skipped: true,
      error: '발송 비활성화 상태 (API 키 또는 채널 ID 미설정)',
    };
  }

  const templateId = TEMPLATE_IDS[templateType];
  if (!templateId) {
    return { success: false, error: `알 수 없는 templateType: ${templateType}` };
  }

  const phone = normalizePhone(to);
  if (!phone || phone.length < 10) {
    return { success: false, error: `수신번호가 올바르지 않습니다: ${to}` };
  }

  const service = getMessageService();
  const message = {
    to: phone,
    kakaoOptions: {
      pfId,
      templateId,
      variables: normalizeVariables(variables),
      disableSms: true,
    },
  };
  if (sender) {
    message.from = normalizePhone(sender);
  }

  try {
    const result = await service.send(message);
    const messageId = extractMessageId(result);
    return { success: true, messageId, templateId };
  } catch (err) {
    const error =
      err?.message ||
      err?.errorMessage ||
      err?.response?.data?.errorMessage ||
      String(err);
    console.error('[solapi] 발송 실패', { templateType, templateId, to: phone, error });
    return { success: false, templateId, error };
  }
}
