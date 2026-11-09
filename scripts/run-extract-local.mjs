import { readFileSync } from 'node:fs';

const CONCURRENCY = 3;
const PROGRESS_EVERY = 20;
const DEDUP_EVERY = 50;

function loadEnvLocal() {
  let text;
  try {
    text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  } catch {
    console.error('.env.local을 읽지 못했습니다. 파일을 확인하고 다시 실행하세요.');
    process.exit(1);
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === '') process.env[key] = value;
  }
}

function readLimit(argv) {
  const index = argv.indexOf('--limit');
  if (index === -1) return null;
  const raw = argv[index + 1];
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value < 1) {
    console.error('--limit은 1 이상의 정수여야 합니다.');
    process.exit(1);
  }
  return value;
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분 ${seconds}초`;
  if (minutes > 0) return `${minutes}분 ${seconds}초`;
  return `${seconds}초`;
}

function isFailure(status) {
  return status === 'classify' || status === 'extract_failed';
}

loadEnvLocal();

const required = ['SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL'];
const missing = required.filter((key) => !String(process.env[key] || '').trim());
if (missing.length) {
  console.error(`환경변수가 없습니다: ${missing.join(', ')}. .env.local을 확인하고 다시 실행하세요.`);
  process.exit(1);
}

const limit = readLimit(process.argv.slice(2));
const startedAt = Date.now();

const { createServiceRoleClient } = await import('../lib/supabaseAdmin.js');
const {
  fetchWorklogExtractCandidates,
  countWorklogExtractCandidates,
  processWorklogExtractRow,
  recomputeWorklogDedup,
} = await import('../lib/worklogExtractJob.js');

const supabase = createServiceRoleClient();
let processed = 0;
let failed = 0;
let progressBucket = 0;
let dedupBucket = 0;
const companies = new Set();
let billing = null;

function describeOutcome(outcome) {
  if (outcome.status === 'extract') {
    return `extract ${outcome.formType || '-'} rows=${outcome.rowCount}`;
  }
  if (outcome.status === 'skipped_reviewed') return 'skipped_reviewed';
  return `${outcome.status} ${outcome.error || ''}`.trim();
}

async function printProgress(label) {
  const remaining = await countWorklogExtractCandidates(supabase);
  console.log(
    `${label} 처리 ${processed}장 · 남음 ${remaining}장 · 실패 ${failed}장 · 경과 ${formatElapsed(Date.now() - startedAt)}`,
  );
}

async function dedupCompanies(reason) {
  if (!companies.size) {
    console.log(`중복 재계산(${reason}): 이번 실행에서 처리한 회사가 없습니다.`);
    return;
  }
  for (const companyId of companies) {
    const result = await recomputeWorklogDedup(companyId, { supabaseAdmin: supabase });
    console.log(
      `중복 재계산(${reason}) company=${companyId ?? 'null'} photos=${result.photos} superseded=${result.supersededPhotos} duplicateRows=${result.duplicateRows}`,
    );
  }
}

console.log(limit == null ? '로컬 추출을 시작합니다. 대상이 없을 때까지 3장씩 처리합니다.' : `로컬 추출을 시작합니다. 최대 ${limit}장, 3장씩 처리합니다.`);

while (limit == null || processed < limit) {
  const room = limit == null ? CONCURRENCY : Math.min(CONCURRENCY, limit - processed);
  if (room < 1) break;
  const candidates = await fetchWorklogExtractCandidates(supabase, room);
  if (!candidates.length) break;

  const wave = await Promise.all(candidates.map((row) => processWorklogExtractRow(supabase, row)));
  let stop = false;
  for (const outcome of wave) {
    if (outcome.status === 'billing_stop') {
      billing = outcome;
      stop = true;
      console.error(
        `Anthropic 크레딧/요금 제한으로 멈춥니다. photo=${outcome.id} attempts=${outcome.attempts} (시도 횟수는 올리지 않음) ${outcome.error}`,
      );
      continue;
    }
    if (outcome.status === 'skipped_lock') continue;
    processed += 1;
    if (outcome.companyId) companies.add(outcome.companyId);
    if (isFailure(outcome.status)) failed += 1;
    console.log(`${processed} ${outcome.id} ${describeOutcome(outcome)}`);
  }

  if (Math.floor(processed / PROGRESS_EVERY) > progressBucket) {
    progressBucket = Math.floor(processed / PROGRESS_EVERY);
    await printProgress('진행');
  }
  if (Math.floor(processed / DEDUP_EVERY) > dedupBucket) {
    dedupBucket = Math.floor(processed / DEDUP_EVERY);
    await dedupCompanies(`${processed}장`);
  }
  if (stop) break;
}

await printProgress('완료');
await dedupCompanies('종료');
if (billing) process.exitCode = 2;
