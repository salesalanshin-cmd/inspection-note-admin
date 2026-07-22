/**
 * 알림톡 템플릿 메타·미리보기 헬퍼 (클라이언트/서버 공용, Node SDK 비의존)
 */

export const TEMPLATE_IDS = {
  frequent_check: 'KA01TP260721043621551fN80wilj90y',
  fives: 'KA01TP260721043717001XZ3sLdevM4Q',
  document: 'KA01TP260721043747643sPlAY6XW8wb',
  combined: 'KA01TP260721043817822XouIadtzUpv',
  daily_summary: 'KA01TP260721043915827qxQPgWQnplJ',
  correction: 'KA01TP260721044039764mhnzz45Kkjy',
};

/** 승인된 템플릿 본문(미리보기·변수 안내용) */
export const TEMPLATE_PREVIEWS = {
  frequent_check:
    '[검사노트] #{작업자명}님, 오늘 #{미실시항목} 검사가 확인되지 않았습니다.\n확인 후 기록해주세요.',
  fives:
    '[검사노트] #{작업자명}님, 오늘 3정5S 기록이 아직 등록되지 않았습니다.\n확인 후 기록해주세요.',
  document:
    '[검사노트] #{작업자명}님, 오늘 작업일보 스캔 기록이 확인되지 않았습니다.\n확인 후 등록해주세요.',
  combined:
    '[검사노트] #{작업자명}님, 오늘 #{미실시항목목록} 항목이 확인되지 않았습니다.\n확인 후 기록해주세요.',
  daily_summary:
    '[검사노트] #{작업자명}님, 오늘(#{날짜}) 담당 업무 현황입니다.\n\n자주검사: #{자주검사상태}\n3정5S: #{3정5S상태}\n문서스캔: #{문서스캔상태}\n\n미완료 항목이 있으면 확인 후 기록해주세요.',
  correction:
    '[검사노트] #{작업자명}님, #{날짜} 등록하신 #{원본유형} 기록이\n관리자 확인 후 #{정정유형}(으)로 수정되었습니다.\n\n다음부터는 #{안내문구}',
};

function normalizeVariables(variables = {}) {
  const out = {};
  for (const [key, value] of Object.entries(variables)) {
    const normalizedKey = key.startsWith('#{') ? key : `#{${key}}`;
    out[normalizedKey] = value == null ? '' : String(value);
  }
  return out;
}

function dutyStatusLabel(section) {
  if (!section || section.status === 'na') return '해당없음';
  if (section.status === 'ok') return '완료';
  if (section.detail) return `미완료(${section.detail})`;
  return '미완료';
}

function collectFailItems(row) {
  const items = [];
  if (row.frequentCheck?.status === 'fail') {
    items.push({
      key: 'frequent_check',
      label: row.frequentCheck.detail
        ? `자주검사(${row.frequentCheck.detail})`
        : '자주검사',
      stageDetail: row.frequentCheck.detail || '초/중/종',
    });
  }
  if (row.fives?.status === 'fail') {
    items.push({ key: 'fives', label: '3정5S', stageDetail: null });
  }
  if (row.documents?.status === 'fail') {
    items.push({ key: 'document', label: '문서스캔', stageDetail: null });
  }
  return items;
}

/**
 * 일일실적 행 → 알림톡 templateType 선택
 * (단일 미준수 → 전용 템플릿, 복수 → combined, 전부 완료 → daily_summary)
 */
export function resolveNotifyTemplateType(row) {
  const fails = collectFailItems(row);
  if (fails.length === 0) return 'daily_summary';
  if (fails.length >= 2) return 'combined';
  return fails[0].key;
}

/**
 * 일일실적 행 → 템플릿 치환 변수
 * @param {object} row
 * @param {{ displayName: string, date?: string }} opts
 */
export function buildNotifyVariables(row, { displayName, date } = {}) {
  const templateType = resolveNotifyTemplateType(row);
  const name = displayName || row.worker_name || '';
  const dateLabel = date || new Date().toISOString().slice(0, 10);
  const fails = collectFailItems(row);

  if (templateType === 'frequent_check') {
    return {
      작업자명: name,
      미실시항목: fails[0]?.stageDetail || row.frequentCheck?.detail || '초/중/종',
    };
  }
  if (templateType === 'fives' || templateType === 'document') {
    return { 작업자명: name };
  }
  if (templateType === 'combined') {
    return {
      작업자명: name,
      미실시항목목록: fails.map((f) => f.label).join(', '),
    };
  }
  if (templateType === 'daily_summary') {
    return {
      작업자명: name,
      날짜: dateLabel,
      자주검사상태: dutyStatusLabel(row.frequentCheck),
      '3정5S상태': dutyStatusLabel(row.fives),
      문서스캔상태: dutyStatusLabel(row.documents),
    };
  }
  return {
    작업자명: name,
    날짜: dateLabel,
    원본유형: '',
    정정유형: '',
    안내문구: '',
  };
}

/** 변수 치환된 미리보기 문구 */
export function renderTemplatePreview(templateType, variables = {}) {
  const raw = TEMPLATE_PREVIEWS[templateType] || '';
  const normalized = normalizeVariables(variables);
  return raw.replace(/#\{[^}]+\}/g, (token) =>
    Object.prototype.hasOwnProperty.call(normalized, token) ? normalized[token] : token
  );
}
