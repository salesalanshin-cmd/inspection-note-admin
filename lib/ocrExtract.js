import Anthropic from '@anthropic-ai/sdk';
import { fetchOcrImageAsBase64 } from './ocrClassify.js';
import { createServiceRoleClient } from './supabaseAdmin.js';

/** SDK가 모델 이름을 제한하지 않으므로, 계정에서 호출 가능한 최신 Sonnet을 기본값으로 둔다. */
export const OCR_EXTRACT_DEFAULT_MODEL = 'claude-sonnet-5-5';

/** 이 값을 바꾸면 예전 프롬프트로 저장된 추출은 다시 뽑을 대상이 된다. */
export const EXTRACT_PROMPT_VERSION = 3;

export const EXTRACT_SYSTEM_PROMPT = `당신은 다이캐스팅 공장의 종이 작업일보 사진을 읽는 OCR 담당입니다.

1. 양식 판별. 문서번호가 같아도 제목으로 구분한다. 문서번호만으로 양식을 정하지 마라.
   DK-GP-06-07은 최종 검사 작업일보와 사상 작업일보가 함께 쓴다.
   수량 칸의 제목으로 구분한다.
   - 수량 칸 제목이 "양품수량"이면 final_inspection이다.
   - 수량 칸 제목이 "작업수량"이면 final_inspection이 아니다. machining, grinding, working_report 중 하나다.
   제목과 수량 칸 제목이 둘 다 보이지 않으면 form_type은 other다. 추측하지 마라.
   수량 칸만 보이면 그 제목으로 final_inspection 여부만 정한다. "작업수량"인데 사상·가공·공용 양식을 가릴 글자가 없으면 other다.
   - final_inspection: 제목에 "최종 검사"가 있거나 수량 칸이 "양품수량"인 작업일보. 수량 칸이 "작업수량"이면 final_inspection이 아니다.
   - grinding: 제목에 "사상" 또는 "Grinding"이 있는 작업일보.
   - machining: 제목에 "가공"이 있는 작업일보.
   - working_report: "작업일보 / WORKING REPORT" 공용 양식. 공정(site) 칸과 LOT No. 칸이 있음.
   - casting: "주조조건셋업 및 작업일보" (주조 일상 1번서류)
   - casting_detail: "세부작업일보" (주조 일상 2번서류)
   - self_check: 자주검사 체크리스트
   - other: 그 밖의 문서나 사진.
   판별 근거를 form_evidence에 짧게 적는다.
   예: "제목 '최종 검사 작업일보', 수량칸 '양품수량'".
   제목이나 수량 칸 제목이 안 보이면 그 자리는 "안 보임"이라고 적는다.
2. 사진에 종이가 여러 장 겹쳐 있으면 가장 위에 온전히 보이는 한 장만 읽으세요. 사진이 회전돼 있으면 바로 세워서 읽으세요.
3. rows를 채우는 양식은 final_inspection과 working_report 두 가지입니다. 다른 양식이면 rows는 빈 배열입니다.
4. final_inspection 읽는 법:
   - 예시 행 "(ex)"는 무시하고, 빈 행도 버리세요.
   - 열: 날짜(date), 작업명/품번(item_code), 시작시간(start), 종료시간(end), 양품수량(qty), 불량 code/Qty 3쌍.
   - 이 양식에는 공정 칸이 없습니다. site는 null로 두세요.
   - 날짜와 LOT를 구분하라.
     - 작업 날짜는 맨 왼쪽 날짜 칸에만 있다. 형식은 "6 21", "07/20", "11/2"처럼 짧다.
     - 품번 칸 안이나 아래에 작게 적힌 "26.06.17 1-1", "260713-1", "26-07205-2" 같은 값은 LOT다. lot_no에 넣고, 절대로 작업 날짜로 쓰지 마라.
     - 날짜 칸이 〃이거나 비어 있으면 위 행의 날짜 칸 값을 이어받는다. LOT의 날짜를 쓰지 않는다.
   - 품번:
     - 이 공장의 품번 형식 예: D070030, D098010, D105860(영문 D + 숫자 6자리), 94500, L1100, 21959-L1100.
     - 보이는 자릿수 그대로 읽는다. 0을 더하거나 빼지 마라.
   - 수량 칸:
     - 양품수량 칸에 시간 없이 숫자만 있으면 그것은 수량이다. 시간으로 해석하지 마라.
     - 수량 칸에 숫자 대신 글자(예: 선별, 지그검사)가 있으면 task_note에 넣고 qty는 null.
5. working_report 읽는 법:
   - 열: 날짜(date), 공정(site), 품명/품번(item_code), LOT No.(lot_no), 시작, 종료, 작업수량(qty), 불량 code/수량 쌍.
   - 공정 칸에 적힌 글자를 site에 그대로 넣습니다(예: "검사"). 비어 있으면 null. 공정 칸의 〃도 위 행을 이어받습니다.
   - 모든 행을 추출합니다. 공정 필터링은 하지 마세요.
6. 날짜 — 두 양식 공통:
   - 날짜는 "MM-DD" 형식입니다. 연도는 붙이지 마세요.
   - 날짜 칸에는 "/"가 미리 인쇄돼 있습니다. 손글씨는 "/"의 왼쪽이 월, 오른쪽이 일입니다. 인쇄된 "/"를 숫자 1로 읽지 마세요.
   - 읽은 날짜가 촬영일보다 뒤면 오독일 가능성이 높습니다. 다시 확인하고, 그래도 확실하지 않으면 그 행의 confidence를 "low"로 하세요.
7. 반복 표시 — 두 양식 공통:
   - 〃, ", '', \\, // 는 날짜·공정·품번·시작시간·종료시간 어디에 있든 위 행의 값을 이어받습니다.
8. 작업자:
   - Name/작업자 칸에 이름이 여러 개면 모두 쉼표로 구분해 sheet_worker에 넣으세요.
9. LOT:
   - LOT 칸은 두 줄로 적히는 경우가 많습니다(예: 윗줄 "A-B", 아랫줄 "26.10.26"). 두 줄을 합쳐 "26.10.26 A-B"처럼 날짜 부분을 앞에 두세요.
10. 시간은 "HH:MM" 형식입니다.
    수량 칸 옆이나 행에 적힌 괄호 메모(예: 지그검사, 선별)는 task_note에 넣으세요. 수량이 없으면 qty는 null.
    불량은 적힌 코드를 그대로 raw_code로, 수량은 정수로.
11. 양식 하단에 불량코드 범례가 인쇄돼 있으면 legend: [{code, name}]으로 함께 반환하세요. 없으면 legend는 빈 배열입니다.
12. confidence 기준:
   - high: 날짜·품번·수량이 모두 또렷하다
   - medium: 한 칸이 흐리지만 문맥(위아래 행, 반복 표시)으로 확정할 수 있다
   - low: 수량이나 날짜를 확정할 수 없다
   품번이나 LOT만 불확실한 경우는 low로 하지 않는다.
   확정할 수 없는 값은 추측하지 말고 null로 둔다.
13. JSON만 응답하세요. 다른 텍스트 금지.

형식:
{
  "form_type": "...",
  "form_evidence": "제목 '최종 검사 작업일보', 수량칸 '양품수량'",
  "doc_number": "DK-GP-06-07 등, 안 보이면 null",
  "sheet_worker": "...",
  "legend": [ { "code": "A01", "name": "결육" } ],
  "rows": [
    { "date": "11-02", "site": "검사", "item_code": "94500", "lot_no": "26.10.25 1-1",
      "task_note": null, "start": "10:00", "end": "17:00", "qty": 2600,
      "defects": [ { "raw_code": "A001", "qty": 21 } ], "confidence": "high" }
  ]
}`;

export function getOcrExtractModel(env = process.env) {
  const configured = String(env.OCR_EXTRACT_MODEL || '').trim();
  return configured || OCR_EXTRACT_DEFAULT_MODEL;
}

/**
 * 모델 텍스트에서 JSON 객체 하나를 꺼낸다. 파싱 실패는 throw.
 * @param {string|null|undefined} text
 */
export function parseWorklogExtractResponse(text) {
  if (text == null || !String(text).trim()) {
    throw new Error('Empty extract response');
  }

  const trimmed = String(text).trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Invalid JSON response from model');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Invalid JSON response from model');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid JSON response from model');
  }

  return parsed;
}

export function normalizeFormEvidence(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  return text.slice(0, 200);
}

const CAPTURED_AT = /^(\d{4})-(\d{2})-(\d{2})$/;

/** JSON.stringify에 포함되지 않는다. 저장 쪽에서 모델 원문만 꺼낸다. */
export const EXTRACT_META = Symbol('extractMeta');

export function readExtractMeta(parsed) {
  const meta = parsed?.[EXTRACT_META];
  return {
    rawText: typeof meta?.rawText === 'string' ? meta.rawText : '',
    model: meta?.model || getOcrExtractModel(),
  };
}

/** 사용자 메시지. 촬영일은 KST 달력일 YYYY-MM-DD. */
export function buildExtractUserText(capturedAtKst) {
  const day = String(capturedAtKst || '').trim();
  if (!CAPTURED_AT.test(day)) {
    throw new Error('capturedAtKst must be YYYY-MM-DD');
  }
  return `이 사진의 촬영일은 ${day}(KST)입니다. 일보의 날짜는 촬영일과 같거나 이전이어야 합니다.`;
}

/**
 * 작업일보 사진 1장 → 파싱된 JSON. DB에 쓰지 않는다.
 * @param {string} imageUrl
 * @param {string} capturedAtKst 촬영일 YYYY-MM-DD (KST)
 * @param {{ supabaseAdmin?: object }} [options]
 */
export async function extractWorklog(imageUrl, capturedAtKst, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const userText = buildExtractUserText(capturedAtKst);
  const supabaseAdmin = options.supabaseAdmin || createServiceRoleClient();
  const model = getOcrExtractModel();
  const { base64, mediaType } = await fetchOcrImageAsBase64(imageUrl, supabaseAdmin);
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    // Sonnet 5.5는 사고 토큰이 max_tokens에 포함된다. disabled는 거절되고
    // between_tools가 응답 전 사고를 끈다. 행이 많은 일보는 8192에서 JSON이 잘려 16000으로 둔다.
    thinking: { type: 'between_tools' },
    system: EXTRACT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          { type: 'text', text: userText },
        ],
      },
    ],
  });

  if (response.stop_reason === 'max_tokens') {
    throw new Error('truncated');
  }

  const textBlock = response.content?.find((block) => block.type === 'text');
  const parsed = parseWorklogExtractResponse(textBlock?.text);
  parsed.form_evidence = normalizeFormEvidence(parsed.form_evidence);
  if (parsed.form_type === 'final_inspection' && Array.isArray(parsed.rows)) {
    for (const row of parsed.rows) {
      if (row && typeof row === 'object') {
        row.site = null;
      }
    }
  }
  if (!Array.isArray(parsed.legend)) parsed.legend = [];
  parsed[EXTRACT_META] = { rawText: textBlock?.text ?? '', model };
  return parsed;
}
