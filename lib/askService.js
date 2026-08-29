import Anthropic from '@anthropic-ai/sdk';
import { INSIGHT_LAB_MODEL } from './constants.js';
import { formatSourceLabel, searchKnowledge } from './knowledgeSearch.js';

export const FORBIDDEN_ANSWER = '이 내용은 관리자에게 직접 문의해 주세요.';
export const NO_SOURCE_ANSWER =
  '사내 자료에서 답을 찾지 못했습니다. 관리자에게 전달했습니다.';

const FORBIDDEN_KEYWORDS = [
  '급여',
  '월급',
  '연봉',
  '임금',
  '수당',
  '보너스',
  '퇴직금',
  '근로계약',
  '고용계약',
  '노무',
  '노동법',
  '징계',
  '해고',
  '권고사직',
  '산재',
  '산업재해',
  '산재보상',
  '인사평가',
  '인사 담당',
];

const FORBIDDEN_CLASSIFY_PROMPT = `당신은 질문 분류기입니다. 아래 금지 주제에 해당하면 YES, 아니면 NO만 출력하세요.

금지 주제 (YES):
- 급여·월급·연봉·임금·수당·보너스·퇴직금 지급
- 근로계약·고용계약
- 노무·노동 분쟁
- 인사 징계·해고·권고사직
- 산재보상·산업재해 보상

금지 아님 (NO) — 매뉴얼에서 답할 수 있는 업무 질문:
- 검사·불량·금형·공정·품질 기준
- 연차·휴가 일수 (회사 복지 규정이 문서에 없으면 검색 단계에서 처리)

출력: YES 또는 NO 한 단어만.`;

function matchesForbiddenKeyword(question) {
  const q = String(question || '');
  return FORBIDDEN_KEYWORDS.some((kw) => q.includes(kw));
}

async function classifyForbiddenTopic(question) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return false;

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: INSIGHT_LAB_MODEL,
    max_tokens: 8,
    system: FORBIDDEN_CLASSIFY_PROMPT,
    messages: [{ role: 'user', content: question }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
    .toUpperCase();

  return text.startsWith('YES');
}

export async function isForbiddenTopic(question) {
  if (matchesForbiddenKeyword(question)) return true;
  return classifyForbiddenTopic(question);
}

function buildContextBlock(hits) {
  return hits
    .map((hit, i) => {
      const label = formatSourceLabel(hit);
      return `[${i}] (${label}, 유사도 ${hit.similarity.toFixed(3)})\n${hit.content}`;
    })
    .join('\n\n');
}

function parseAnswerJson(text) {
  const trimmed = String(text || '').trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : '';
    const usedSources = Array.isArray(parsed.usedSources)
      ? parsed.usedSources.filter((n) => Number.isInteger(n) && n >= 0)
      : [];
    return { answer, usedSources };
  } catch {
    return null;
  }
}

async function generateAnswer(question, hits) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다.');

  const client = new Anthropic({ apiKey });
  const system = `당신은 제조 현장 작업자를 돕는 사내 매뉴얼 안내입니다.

규칙:
· 제공된 자료 안에서만 답하세요. 자료에 없는 내용을 추측하지 마세요.
· 답을 찾을 수 없으면 answer에 "자료에서 찾지 못했습니다"만 적으세요.
· 3~5줄로 짧게, 존댓말로 답하세요. 인사말은 붙이지 마세요.
· 숫자·기준값은 자료에 적힌 그대로 인용하세요.

반드시 JSON만 출력하세요:
{"answer":"답변","usedSources":[0,1]}
usedSources에는 답변 근거가 된 자료 번호만 넣으세요.`;

  const response = await client.messages.create({
    model: INSIGHT_LAB_MODEL,
    max_tokens: 512,
    system,
    messages: [
      {
        role: 'user',
        content: `자료:\n${buildContextBlock(hits)}\n\n질문: ${question}`,
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const parsed = parseAnswerJson(text);
  if (!parsed?.answer) {
    throw new Error('AI 응답을 파싱하지 못했습니다.');
  }

  return parsed;
}

function toSourceDto(hit) {
  return {
    label: formatSourceLabel(hit),
    documentTitle: hit.documentTitle,
    pageFrom: hit.pageFrom,
    sourceKind: hit.sourceKind,
  };
}

/**
 * @param {string} question
 * @param {{ companyId: string, matchCount?: number, minSimilarity?: number }} opts
 */
export async function askQuestion(question, opts) {
  const trimmed = String(question || '').trim();
  const matchCount = opts.matchCount ?? 5;
  const minSimilarity = opts.minSimilarity ?? 0.43;

  if (!trimmed) {
    return {
      answer: NO_SOURCE_ANSWER,
      sources: [],
      status: 'no_source',
      hits: [],
      blockedLayer: null,
    };
  }

  if (await isForbiddenTopic(trimmed)) {
    return {
      answer: FORBIDDEN_ANSWER,
      sources: [],
      status: 'no_source',
      hits: [],
      blockedLayer: 'forbidden',
    };
  }

  const hits = await searchKnowledge(trimmed, {
    companyId: opts.companyId,
    matchCount,
    minSimilarity,
  });

  if (!hits.length || hits[0].similarity < minSimilarity) {
    return {
      answer: NO_SOURCE_ANSWER,
      sources: [],
      status: 'no_source',
      hits,
      blockedLayer: 'no_match',
    };
  }

  const { answer, usedSources } = await generateAnswer(trimmed, hits);

  if (!answer || answer.includes('자료에서 찾지 못했습니다')) {
    return {
      answer: NO_SOURCE_ANSWER,
      sources: [],
      status: 'no_source',
      hits,
      blockedLayer: 'no_answer',
    };
  }

  const uniqueIndexes = [...new Set(usedSources)].filter((i) => i < hits.length);
  const sources = [];
  const seen = new Set();
  for (const i of uniqueIndexes) {
    const dto = toSourceDto(hits[i]);
    const key = `${dto.label}|${dto.pageFrom}|${dto.sourceKind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(dto);
  }

  return {
    answer,
    sources,
    status: 'answered',
    hits,
    blockedLayer: null,
  };
}
