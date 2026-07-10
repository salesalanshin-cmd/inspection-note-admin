import { createClient } from '@supabase/supabase-js';
import {
  DEFECT_CODE_LABELS,
  DOC_ERROR_CODES,
  SOS_ERROR_CODES,
} from './constants';

const MAX_ROWS = 500;
const NOT_DELETED = 'is_deleted.eq.false,is_deleted.is.null';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase credentials not configured');
  }
  return createClient(url, key);
}

function toResult(rows, columns) {
  const limited = (rows || []).slice(0, MAX_ROWS);
  return {
    rows: limited,
    columns,
    rowCount: limited.length,
    truncated: (rows || []).length > MAX_ROWS,
  };
}

function applyDateRange(query, dateFrom, dateTo) {
  let q = query;
  if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`);
  if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59.999`);
  return q;
}

export async function queryDefects({
  workerName,
  defectCode,
  dateFrom,
  dateTo,
} = {}) {
  const supabase = getSupabase();
  let query = supabase
    .from('defect_reports')
    .select('worker_name, defect_code, defect_type, defect_stage, created_at, file_name')
    .or(NOT_DELETED)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (workerName) query = query.eq('worker_name', workerName);
  if (defectCode) query = query.eq('defect_code', defectCode);
  query = applyDateRange(query, dateFrom, dateTo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const columns = [
    'worker_name',
    'defect_code',
    'defect_type',
    'defect_stage',
    'created_at',
    'file_name',
  ];
  return toResult(data, columns);
}

export async function queryGoodReports({ workerName, dateFrom, dateTo } = {}) {
  const supabase = getSupabase();
  let query = supabase
    .from('good_reports')
    .select('worker_name, created_at, file_name')
    .or(NOT_DELETED)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (workerName) query = query.eq('worker_name', workerName);
  query = applyDateRange(query, dateFrom, dateTo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return toResult(data, ['worker_name', 'created_at', 'file_name']);
}

export async function queryFivesReports({
  workerName,
  areaType,
  sosErrorCode,
  dateFrom,
  dateTo,
} = {}) {
  const supabase = getSupabase();
  let query = supabase
    .from('fives_reports')
    .select(
      'worker_name, area_type, sos_error_code, description, created_at, file_name'
    )
    .or(NOT_DELETED)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (workerName) query = query.eq('worker_name', workerName);
  if (areaType) query = query.eq('area_type', areaType);
  if (sosErrorCode) {
    query = query.eq('sos_error_code', sosErrorCode);
  }
  query = applyDateRange(query, dateFrom, dateTo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const columns = [
    'worker_name',
    'area_type',
    'sos_error_code',
    'description',
    'created_at',
    'file_name',
  ];
  return toResult(data, columns);
}

export async function queryDocuments({
  workerName,
  docType,
  docErrorCode,
  dateFrom,
  dateTo,
} = {}) {
  const supabase = getSupabase();
  let query = supabase
    .from('ocr_results')
    .select(
      'worker_name, doc_type, doc_title, doc_error_code, doc_error_note, created_at, file_name'
    )
    .or(NOT_DELETED)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (workerName) query = query.eq('worker_name', workerName);
  if (docType) query = query.eq('doc_type', docType);
  if (docErrorCode) query = query.eq('doc_error_code', docErrorCode);
  query = applyDateRange(query, dateFrom, dateTo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const columns = [
    'worker_name',
    'doc_type',
    'doc_title',
    'doc_error_code',
    'doc_error_note',
    'created_at',
    'file_name',
  ];
  return toResult(data, columns);
}

export async function queryWorkerDirectory() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('worker_directory')
    .select('worker_name, excluded, default_shift, note, created_at')
    .order('worker_name')
    .limit(MAX_ROWS);

  if (error) throw new Error(error.message);

  const columns = ['worker_name', 'excluded', 'default_shift', 'note', 'created_at'];
  return toResult(data, columns);
}

export function getKnownCodeLists() {
  const format = (title, codes) =>
    `${title}:\n${Object.entries(codes)
      .map(([code, label]) => `  ${code}: ${label}`)
      .join('\n')}`;

  return {
    text: [
      format('불량 코드 (DEFECT_CODE_LABELS)', DEFECT_CODE_LABELS),
      format('3정5S SOS 코드 (SOS_ERROR_CODES)', SOS_ERROR_CODES),
      format('문서스캔 DOC 코드 (DOC_ERROR_CODES)', DOC_ERROR_CODES),
    ].join('\n\n'),
    defectCodes: DEFECT_CODE_LABELS,
    sosCodes: SOS_ERROR_CODES,
    docCodes: DOC_ERROR_CODES,
  };
}

const TOOL_HANDLERS = {
  queryDefects,
  queryGoodReports,
  queryFivesReports,
  queryDocuments,
  queryWorkerDirectory,
  getKnownCodeLists: async () => getKnownCodeLists(),
};

/** Anthropic Messages API tool definitions */
export const AI_CONSOLE_TOOL_DEFINITIONS = [
  {
    name: 'queryDefects',
    description:
      '불량 기록(defect_reports) 조회. 삭제되지 않은 행만. 최대 500행.',
    input_schema: {
      type: 'object',
      properties: {
        workerName: { type: 'string', description: '작업자 이름 (정확히 일치)' },
        defectCode: { type: 'string', description: '불량 코드 (예: A001, GR001)' },
        dateFrom: { type: 'string', description: '시작일 YYYY-MM-DD' },
        dateTo: { type: 'string', description: '종료일 YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'queryGoodReports',
    description: '양품 기록(good_reports) 조회. 삭제되지 않은 행만. 최대 500행.',
    input_schema: {
      type: 'object',
      properties: {
        workerName: { type: 'string', description: '작업자 이름' },
        dateFrom: { type: 'string', description: '시작일 YYYY-MM-DD' },
        dateTo: { type: 'string', description: '종료일 YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'queryFivesReports',
    description: '3정5S 기록(fives_reports) 조회. 삭제되지 않은 행만. 최대 500행.',
    input_schema: {
      type: 'object',
      properties: {
        workerName: { type: 'string', description: '작업자 이름' },
        areaType: { type: 'string', description: '구역/유형' },
        sosErrorCode: { type: 'string', description: 'SOS 오류 코드 (예: SOS-006)' },
        dateFrom: { type: 'string', description: '시작일 YYYY-MM-DD' },
        dateTo: { type: 'string', description: '종료일 YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'queryDocuments',
    description: '문서스캔(ocr_results) 조회. 삭제되지 않은 행만. 최대 500행.',
    input_schema: {
      type: 'object',
      properties: {
        workerName: { type: 'string', description: '작업자 이름' },
        docType: { type: 'string', description: '문서 유형' },
        docErrorCode: { type: 'string', description: 'DOC 오류 코드 (예: DOC-003)' },
        dateFrom: { type: 'string', description: '시작일 YYYY-MM-DD' },
        dateTo: { type: 'string', description: '종료일 YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'queryWorkerDirectory',
    description: '작업자 디렉터리(worker_directory) 전체 조회. 제외 여부·근무조 포함.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'getKnownCodeLists',
    description: '불량/SOS/DOC 유효 오류 코드 목록 조회 (필터 값 확인용).',
    input_schema: { type: 'object', properties: {} },
  },
];

export async function executeAiConsoleTool(name, input) {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return handler(input || {});
}

export const AI_CONSOLE_SYSTEM_PROMPT = `당신은 검사노트 관리자용 데이터 조회 어시스턴트입니다.
아래 제공된 도구로만 데이터를 조회할 수 있고, 절대 데이터를 수정/삭제할 수 없습니다.

## 데이터베이스 구조 요약
- defect_reports: 불량 기록 (worker_name, defect_code, defect_type, defect_stage, created_at, file_name, is_deleted)
- good_reports: 양품 기록 (worker_name, created_at, file_name, is_deleted)
- fives_reports: 3정5S 기록 (worker_name, area_type, sos_error_code, description, created_at, is_deleted)
- ocr_results: 문서스캔 (worker_name, doc_type, doc_title, doc_error_code, doc_error_note, created_at, is_deleted)
- worker_directory: 작업자 설정 (worker_name, excluded, default_shift, note)

조회 도구는 is_deleted=false인 행만 반환합니다. 휴지통 데이터는 조회되지 않습니다.
날짜 필터는 created_at 기준입니다 (dateFrom/dateTo는 YYYY-MM-DD).

사용자가 표/엑셀을 요청하면, 마지막에 결과를 마크다운 표로 정리해서 보여주고,
어떤 데이터인지 한 줄 요약도 함께 제공하세요.
집계가 필요하면 조회 결과를 바탕으로 계산해 답변하세요.
한국어로 친절하고 간결하게 답변하세요.`;
